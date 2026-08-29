import { db } from '../db/index.js';
import { hashSenha, conferirSenha, novoToken } from '../seguranca/cripto.js';
import { paraDH } from '../dominio/datas.js';
import { registrarAuditoria } from './auditoria.js';

const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000; // 8h

export function criarUsuario({ login, nome, senha, papel }, ator = 'sistema', ip = '') {
  if (!['admin', 'rh', 'supervisor'].includes(papel)) throw new Error('Papel invalido.');
  if (!senha || senha.length < 10) {
    throw new Error('A senha administrativa deve ter ao menos 10 caracteres.');
  }
  const { hash, salt } = hashSenha(senha);
  db().prepare(`
    INSERT INTO usuario (login, nome, senha_hash, senha_salt, papel, criado_em)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (login) DO UPDATE SET
      nome = excluded.nome, senha_hash = excluded.senha_hash,
      senha_salt = excluded.senha_salt, papel = excluded.papel, ativo = 1
  `).run(String(login).toLowerCase().trim(), nome, hash, salt, papel, paraDH(new Date()));
  registrarAuditoria({ ator, acao: 'usuario.criacao', alvo: login, detalhe: papel, ip });
}

/** Autentica e abre sessao. Retorna o token ou null. */
export function autenticar(login, senha, ip = '') {
  const usuario = db().prepare('SELECT * FROM usuario WHERE login = ? AND ativo = 1')
    .get(String(login || '').toLowerCase().trim());
  if (!usuario || !conferirSenha(senha || '', usuario.senha_hash, usuario.senha_salt)) {
    registrarAuditoria({ ator: login || '?', acao: 'login.falha', ip });
    return null;
  }
  const token = novoToken(32);
  const agora = new Date();
  db().prepare('INSERT INTO sessao (token, usuario_id, criado_em, expira_em) VALUES (?, ?, ?, ?)')
    .run(token, usuario.id, paraDH(agora), paraDH(new Date(agora.getTime() + DURACAO_SESSAO_MS)));
  registrarAuditoria({ ator: usuario.login, acao: 'login.sucesso', ip });
  return { token, usuario: { id: usuario.id, login: usuario.login, nome: usuario.nome, papel: usuario.papel } };
}

/** Resolve uma sessao valida. */
export function sessaoValida(token) {
  if (!token) return null;
  const linha = db().prepare(`
    SELECT s.token, s.expira_em, u.id, u.login, u.nome, u.papel
      FROM sessao s JOIN usuario u ON u.id = s.usuario_id
     WHERE s.token = ? AND u.ativo = 1
  `).get(token);
  if (!linha) return null;
  if (new Date(linha.expira_em.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) < new Date()) {
    db().prepare('DELETE FROM sessao WHERE token = ?').run(token);
    return null;
  }
  return { id: linha.id, login: linha.login, nome: linha.nome, papel: linha.papel };
}

export function encerrarSessao(token) {
  db().prepare('DELETE FROM sessao WHERE token = ?').run(token);
}

export function existeAdmin() {
  return db().prepare("SELECT COUNT(*) c FROM usuario WHERE papel = 'admin' AND ativo = 1").get().c > 0;
}

export function listarUsuarios() {
  return db().prepare('SELECT id, login, nome, papel, ativo, criado_em FROM usuario ORDER BY login').all();
}
