import { db } from '../db/index.js';
import { cifrar, decifrar } from '../seguranca/cripto.js';
import { paraDH } from '../dominio/datas.js';
import { registrarAuditoria } from './auditoria.js';

/**
 * Cadastra (ou substitui) o template de um dedo. O template chega ja
 * capturado pelo driver; aqui ele so e cifrado e guardado.
 *
 * Boa pratica operacional: cadastrar pelo menos dois dedos por pessoa, de maos
 * diferentes, para que um curativo nao obrigue o uso da credencial alternativa.
 */
export function cadastrarTemplate({ trabalhadorId, dedo, template, qualidade, modelo, ator, ip }) {
  const agora = paraDH(new Date());
  db().prepare(`
    INSERT INTO biometria (trabalhador_id, dedo, template_cifr, qualidade, leitor_modelo, criado_em)
    VALUES (@trabalhadorId, @dedo, @template, @qualidade, @modelo, @agora)
    ON CONFLICT (trabalhador_id, dedo) DO UPDATE SET
      template_cifr = excluded.template_cifr,
      qualidade     = excluded.qualidade,
      leitor_modelo = excluded.leitor_modelo,
      criado_em     = excluded.criado_em,
      revogado_em   = NULL
  `).run({
    trabalhadorId, dedo, template: cifrar(template),
    qualidade: qualidade | 0, modelo: modelo || '', agora
  });

  registrarAuditoria({
    ator, acao: 'biometria.cadastro', alvo: `trabalhador:${trabalhadorId}`,
    detalhe: `dedo=${dedo} qualidade=${qualidade}`, ip
  });
}

/** Revoga um template (LGPD: o titular pode pedir a eliminacao do dado). */
export function revogarTemplate({ trabalhadorId, dedo, ator, ip }) {
  const agora = paraDH(new Date());
  // O template e apagado de fato, nao apenas marcado — art. 18, VI da LGPD.
  const info = db().prepare(`
    UPDATE biometria SET template_cifr = zeroblob(0), revogado_em = ?
    WHERE trabalhador_id = ? AND dedo = ? AND revogado_em IS NULL
  `).run(agora, trabalhadorId, dedo);

  registrarAuditoria({
    ator, acao: 'biometria.revogacao', alvo: `trabalhador:${trabalhadorId}`,
    detalhe: `dedo=${dedo}`, ip
  });
  return info.changes > 0;
}

/**
 * Carrega os templates ativos para a identificacao 1:N. Os templates ficam
 * decifrados apenas na memoria do processo, pelo tempo da comparacao.
 */
export function candidatosAtivos() {
  const linhas = db().prepare(`
    SELECT b.trabalhador_id, b.template_cifr
      FROM biometria b
      JOIN trabalhador t ON t.id = b.trabalhador_id
     WHERE b.revogado_em IS NULL
       AND t.ativo = 1
       AND length(b.template_cifr) > 0
  `).all();

  const candidatos = [];
  for (const linha of linhas) {
    try {
      candidatos.push({
        trabalhadorId: linha.trabalhador_id,
        template: decifrar(linha.template_cifr)
      });
    } catch {
      // Template corrompido ou cifrado com outra chave: ignoramos na comparacao
      // e o problema aparece no relatorio de saude do sistema.
    }
  }
  return candidatos;
}

/** Quantos dedos ativos cada trabalhador tem cadastrados. */
export function resumoPorTrabalhador() {
  return db().prepare(`
    SELECT trabalhador_id, COUNT(*) dedos, MAX(criado_em) ultimo
      FROM biometria WHERE revogado_em IS NULL AND length(template_cifr) > 0
     GROUP BY trabalhador_id
  `).all();
}
