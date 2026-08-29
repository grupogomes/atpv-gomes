import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { paraDH } from './datas.js';

/** Hash inicial da cadeia (genesis). */
export const HASH_GENESIS = '0'.repeat(64);

/**
 * Serializa o conteudo de forma canonica (chaves ordenadas) para que o hash
 * seja reproduzivel por qualquer auditor a partir dos mesmos dados.
 */
export function canonico(valor) {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  const chaves = Object.keys(valor).sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`).join(',')}}`;
}

/** Calcula o hash SHA-256 de um elo da cadeia. */
export function calcularHash({ nsr, tipo, dh, dhGravacao, conteudo, hashAnterior }) {
  const material = [hashAnterior, nsr, tipo, dh, dhGravacao, canonico(conteudo)].join('|');
  return crypto.createHash('sha256').update(material, 'utf8').digest('hex');
}

/** Ultimo elo gravado, ou o genesis se o livro estiver vazio. */
export function ultimoElo() {
  const linha = db()
    .prepare('SELECT nsr, hash FROM registro ORDER BY nsr DESC LIMIT 1')
    .get();
  return linha ? { nsr: linha.nsr, hash: linha.hash } : { nsr: 0, hash: HASH_GENESIS };
}

/**
 * Acrescenta um registro ao livro-razao. Nao existe funcao de alterar ou
 * remover: e a garantia tecnica da imutabilidade exigida pela Portaria 671.
 *
 * @param {{tipo: string, dh?: Date, conteudo: object}} entrada
 * @returns {{nsr: number, tipo: string, dh: string, dhGravacao: string, hash: string, conteudo: object}}
 */
export function acrescentar({ tipo, dh = new Date(), conteudo }) {
  const banco = db();
  const gravar = banco.transaction(() => {
    const anterior = ultimoElo();
    const nsr = anterior.nsr + 1;
    const dhTexto = paraDH(dh);
    const dhGravacao = paraDH(new Date());
    const hash = calcularHash({
      nsr, tipo, dh: dhTexto, dhGravacao, conteudo, hashAnterior: anterior.hash
    });
    banco.prepare(`
      INSERT INTO registro (nsr, tipo, dh, dh_gravacao, conteudo, hash_anterior, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(nsr, tipo, dhTexto, dhGravacao, canonico(conteudo), anterior.hash, hash);
    return { nsr, tipo, dh: dhTexto, dhGravacao, hash, hashAnterior: anterior.hash, conteudo };
  });
  return gravar();
}

/** Le um registro pelo NSR. */
export function lerRegistro(nsr) {
  const linha = db().prepare('SELECT * FROM registro WHERE nsr = ?').get(nsr);
  return linha ? materializar(linha) : null;
}

function materializar(linha) {
  return {
    nsr: linha.nsr,
    tipo: linha.tipo,
    dh: linha.dh,
    dhGravacao: linha.dh_gravacao,
    hash: linha.hash,
    hashAnterior: linha.hash_anterior,
    conteudo: JSON.parse(linha.conteudo)
  };
}

/** Lista registros por faixa de data/hora e, opcionalmente, tipo. */
export function listarRegistros({ inicio, fim, tipos } = {}) {
  const filtros = [];
  const params = [];
  if (inicio) { filtros.push('dh >= ?'); params.push(inicio); }
  if (fim) { filtros.push('dh <= ?'); params.push(fim); }
  if (tipos?.length) {
    filtros.push(`tipo IN (${tipos.map(() => '?').join(',')})`);
    params.push(...tipos);
  }
  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  return db()
    .prepare(`SELECT * FROM registro ${onde} ORDER BY nsr`)
    .all(...params)
    .map(materializar);
}

/**
 * Reconfere a cadeia inteira: recalcula cada hash e verifica o encadeamento e
 * a continuidade do NSR. E o autoteste de integridade que a fiscalizacao pode
 * pedir — e que denuncia qualquer adulteracao direta no arquivo do banco.
 */
export function verificarIntegridade() {
  const linhas = db().prepare('SELECT * FROM registro ORDER BY nsr').all();
  let esperadoAnterior = HASH_GENESIS;
  let esperadoNsr = 1;
  const problemas = [];

  for (const linha of linhas) {
    if (linha.nsr !== esperadoNsr) {
      problemas.push({ nsr: linha.nsr, erro: `NSR fora de sequencia (esperado ${esperadoNsr})` });
      esperadoNsr = linha.nsr;
    }
    if (linha.hash_anterior !== esperadoAnterior) {
      problemas.push({ nsr: linha.nsr, erro: 'encadeamento rompido: hash anterior nao confere' });
    }
    const recalculado = calcularHash({
      nsr: linha.nsr,
      tipo: linha.tipo,
      dh: linha.dh,
      dhGravacao: linha.dh_gravacao,
      conteudo: JSON.parse(linha.conteudo),
      hashAnterior: linha.hash_anterior
    });
    if (recalculado !== linha.hash) {
      problemas.push({ nsr: linha.nsr, erro: 'conteudo adulterado: hash nao confere' });
    }
    esperadoAnterior = linha.hash;
    esperadoNsr = linha.nsr + 1;
  }

  return { total: linhas.length, integro: problemas.length === 0, problemas };
}
