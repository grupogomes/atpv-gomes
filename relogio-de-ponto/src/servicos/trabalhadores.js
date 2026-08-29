import { db } from '../db/index.js';
import { acrescentar } from '../dominio/livro.js';
import { normalizarCpf, cpfValido } from '../dominio/cpf.js';
import { paraDH } from '../dominio/datas.js';
import { registrarAuditoria } from './auditoria.js';
import { sha256 } from '../seguranca/cripto.js';

export class ErroValidacao extends Error {
  constructor(mensagem) { super(mensagem); this.codigo = 'VALIDACAO'; }
}

/**
 * Cria ou atualiza um trabalhador. Toda inclusao, alteracao ou desligamento
 * gera registro tipo "5" no livro-razao, como o AFD exige.
 */
export function salvarTrabalhador(dados, ator = 'sistema', ip = '') {
  const cpf = normalizarCpf(dados.cpf);
  if (!cpfValido(cpf)) throw new ErroValidacao('CPF inválido.');
  const nome = String(dados.nome || '').trim();
  if (nome.length < 3) throw new ErroValidacao('Nome do trabalhador é obrigatório.');

  const agora = paraDH(new Date());
  const existente = db().prepare('SELECT * FROM trabalhador WHERE cpf = ?').get(cpf);

  const linha = {
    cpf,
    nome,
    matricula: String(dados.matricula || '').trim(),
    cargo: String(dados.cargo || '').trim(),
    admissao: dados.admissao || existente?.admissao || null,
    demissao: dados.demissao ?? existente?.demissao ?? null,
    ativo: dados.ativo === undefined ? (existente?.ativo ?? 1) : (dados.ativo ? 1 : 0),
    isentoJornada: dados.isentoJornada === undefined
      ? (existente?.isento_jornada ?? 0)
      : (dados.isentoJornada ? 1 : 0),
    agora
  };

  if (existente) {
    db().prepare(`
      UPDATE trabalhador SET nome=@nome, matricula=@matricula, cargo=@cargo,
        admissao=@admissao, demissao=@demissao, ativo=@ativo,
        isento_jornada=@isentoJornada, atualizado_em=@agora
      WHERE cpf=@cpf
    `).run(linha);
  } else {
    db().prepare(`
      INSERT INTO trabalhador (cpf, nome, matricula, cargo, admissao, demissao,
        ativo, isento_jornada, criado_em, atualizado_em)
      VALUES (@cpf, @nome, @matricula, @cargo, @admissao, @demissao,
        @ativo, @isentoJornada, @agora, @agora)
    `).run(linha);
  }

  const operacao = existente ? (linha.ativo ? 'A' : 'E') : 'I'; // Inclusao/Alteracao/Exclusao
  acrescentar({
    tipo: '5',
    conteudo: {
      operacao, cpf, nome: linha.nome, matricula: linha.matricula,
      admissao: linha.admissao, demissao: linha.demissao
    }
  });

  registrarAuditoria({
    ator, acao: existente ? 'trabalhador.alteracao' : 'trabalhador.inclusao',
    alvo: cpf, detalhe: nome, ip
  });

  return buscarPorCpf(cpf);
}

export function buscarPorCpf(cpf) {
  return db().prepare('SELECT * FROM trabalhador WHERE cpf = ?').get(normalizarCpf(cpf)) || null;
}

export function buscarPorId(id) {
  return db().prepare('SELECT * FROM trabalhador WHERE id = ?').get(id) || null;
}

export function listarTrabalhadores({ incluirInativos = false } = {}) {
  const onde = incluirInativos ? '' : 'WHERE ativo = 1';
  return db().prepare(`SELECT * FROM trabalhador ${onde} ORDER BY nome`).all();
}

/**
 * Registra o consentimento informado para o tratamento do dado biometrico.
 * A LGPD trata biometria como dado sensivel (art. 5, II) e exige base legal
 * especifica (art. 11) — guardamos versao e hash do termo efetivamente aceito.
 */
export function registrarConsentimento({ trabalhadorId, versaoTermo, textoTermo, finalidade, ator = '', ip = '' }) {
  const agora = paraDH(new Date());
  db().prepare(`
    INSERT INTO consentimento (trabalhador_id, versao_termo, hash_termo, finalidade, concedido_em, registrado_por)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(trabalhadorId, versaoTermo, sha256(textoTermo), finalidade, agora, ator);
  registrarAuditoria({ ator, acao: 'lgpd.consentimento', alvo: `trabalhador:${trabalhadorId}`, detalhe: versaoTermo, ip });
}

/** Consentimento vigente (nao revogado) do trabalhador, se houver. */
export function consentimentoVigente(trabalhadorId) {
  return db().prepare(`
    SELECT * FROM consentimento
     WHERE trabalhador_id = ? AND revogado_em IS NULL
     ORDER BY id DESC LIMIT 1
  `).get(trabalhadorId) || null;
}

export function revogarConsentimento(trabalhadorId, ator = '', ip = '') {
  db().prepare(`
    UPDATE consentimento SET revogado_em = ?
     WHERE trabalhador_id = ? AND revogado_em IS NULL
  `).run(paraDH(new Date()), trabalhadorId);
  registrarAuditoria({ ator, acao: 'lgpd.consentimento.revogacao', alvo: `trabalhador:${trabalhadorId}`, ip });
}
