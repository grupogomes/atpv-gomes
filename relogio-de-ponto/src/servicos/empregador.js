import { db } from '../db/index.js';
import { acrescentar } from '../dominio/livro.js';
import { paraDH } from '../dominio/datas.js';
import { registrarAuditoria } from './auditoria.js';

/** Dados correntes do empregador. */
export function empregadorAtual() {
  return db().prepare('SELECT * FROM empregador WHERE id = 1').get() || null;
}

/**
 * Registra ou atualiza os dados do empregador. Toda alteracao vira um registro
 * tipo "2" no livro-razao — e o que o AFD exige para que a fiscalizacao veja o
 * historico de identificacao da empresa dentro do proprio arquivo.
 */
export function registrarEmpregador(dados, ator = 'sistema', ip = '') {
  const atual = empregadorAtual();
  const novo = {
    tipoIdentificador: Number(dados.tipoIdentificador ?? dados.tipo_identificador ?? 1),
    documento: String(dados.documento || '').replace(/\D/g, ''),
    cnoCaepf: String(dados.cnoCaepf ?? dados.cno_caepf ?? '').replace(/\D/g, ''),
    razaoSocial: String(dados.razaoSocial ?? dados.razao_social ?? '').trim(),
    endereco: String(dados.endereco || '').trim()
  };

  const mudou = !atual
    || atual.tipo_identificador !== novo.tipoIdentificador
    || atual.documento !== novo.documento
    || atual.cno_caepf !== novo.cnoCaepf
    || atual.razao_social !== novo.razaoSocial;

  const agora = paraDH(new Date());
  db().prepare(`
    INSERT INTO empregador (id, tipo_identificador, documento, cno_caepf, razao_social, endereco, atualizado_em)
    VALUES (1, @tipoIdentificador, @documento, @cnoCaepf, @razaoSocial, @endereco, @agora)
    ON CONFLICT (id) DO UPDATE SET
      tipo_identificador = excluded.tipo_identificador,
      documento          = excluded.documento,
      cno_caepf          = excluded.cno_caepf,
      razao_social       = excluded.razao_social,
      endereco           = excluded.endereco,
      atualizado_em      = excluded.atualizado_em
  `).run({ ...novo, agora });

  if (mudou) {
    acrescentar({ tipo: '2', conteudo: novo });
    registrarAuditoria({ ator, acao: 'empregador.atualizacao', detalhe: novo.razaoSocial, ip });
  }
  return novo;
}
