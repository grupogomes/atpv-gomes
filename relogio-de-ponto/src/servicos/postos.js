import { db } from '../db/index.js';
import { hashSenha, conferirSenha, novoToken } from '../seguranca/cripto.js';
import { paraDH } from '../dominio/datas.js';
import { registrarAuditoria } from './auditoria.js';

/**
 * Posto = um computador da empresa autorizado a registrar ponto.
 *
 * O provisionamento entrega UMA VEZ um token secreto, que fica gravado no
 * navegador daquela maquina. Sem posto ativo + token valido + rede autorizada,
 * nenhuma marcacao entra. E isso, somado a biometria, que torna inviavel bater
 * o ponto de casa ou pelo celular de outra pessoa.
 */
export function provisionarPosto({ id, nome, local = '', ator = 'sistema', ip = '' }) {
  const identificador = String(id || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{2,31}$/.test(identificador)) {
    throw new Error('Identificador de posto inválido (use 3 a 32 caracteres: A-Z, 0-9, . _ -).');
  }
  const token = novoToken(32);
  const { hash, salt } = hashSenha(token);
  db().prepare(`
    INSERT INTO posto (id, nome, token_hash, token_salt, local, ativo, criado_em)
    VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT (id) DO UPDATE SET
      nome = excluded.nome, token_hash = excluded.token_hash,
      token_salt = excluded.token_salt, local = excluded.local, ativo = 1
  `).run(identificador, nome || identificador, hash, salt, local, paraDH(new Date()));

  registrarAuditoria({ ator, acao: 'posto.provisionamento', alvo: identificador, ip });
  // O token so existe aqui: nao ha como recupera-lo depois, apenas reemitir.
  return { id: identificador, token };
}

export function desativarPosto(id, ator = 'sistema', ip = '') {
  db().prepare('UPDATE posto SET ativo = 0 WHERE id = ?').run(String(id).toUpperCase());
  registrarAuditoria({ ator, acao: 'posto.desativacao', alvo: id, ip });
}

export function listarPostos() {
  return db().prepare('SELECT id, nome, local, ativo, criado_em, ultimo_uso_em FROM posto ORDER BY id').all();
}

/** Autentica um posto pelo par (id, token). Retorna o posto ou null. */
export function autenticarPosto(id, token) {
  if (!id || !token) return null;
  const posto = db().prepare('SELECT * FROM posto WHERE id = ? AND ativo = 1')
    .get(String(id).trim().toUpperCase());
  if (!posto) return null;
  if (!conferirSenha(token, posto.token_hash, posto.token_salt)) return null;
  db().prepare('UPDATE posto SET ultimo_uso_em = ? WHERE id = ?')
    .run(paraDH(new Date()), posto.id);
  return posto;
}
