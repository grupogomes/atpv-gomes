import { db } from '../db/index.js';
import { paraDH } from '../dominio/datas.js';

/** Grava uma linha de auditoria. Nunca falha a operacao principal por causa dela. */
export function registrarAuditoria({ ator, acao, alvo = '', detalhe = '', ip = '' }) {
  try {
    db().prepare(`
      INSERT INTO auditoria (dh, ator, acao, alvo, detalhe, origem_ip)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(paraDH(new Date()), String(ator || 'sistema'), acao, alvo, detalhe, ip);
  } catch (erro) {
    console.error('[auditoria] falha ao gravar:', erro.message);
  }
}

/** Consulta a auditoria por periodo. */
export function listarAuditoria({ inicio, fim, limite = 500 } = {}) {
  const filtros = [];
  const params = [];
  if (inicio) { filtros.push('dh >= ?'); params.push(inicio); }
  if (fim) { filtros.push('dh <= ?'); params.push(fim); }
  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  params.push(limite);
  return db().prepare(`SELECT * FROM auditoria ${onde} ORDER BY id DESC LIMIT ?`).all(...params);
}
