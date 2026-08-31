import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));

let instancia = null;

/** Abre (e cria, se preciso) o banco, aplicando o esquema. */
export function db() {
  if (instancia) return instancia;
  fs.mkdirSync(path.dirname(config.banco), { recursive: true });
  instancia = new Database(config.banco);
  instancia.pragma('journal_mode = WAL');
  instancia.pragma('foreign_keys = ON');
  instancia.exec(fs.readFileSync(path.join(aqui, 'schema.sql'), 'utf8'));
  aplicarMigracoes(instancia);
  return instancia;
}

/**
 * Colunas acrescentadas depois que bancos ja estavam em producao.
 * `CREATE TABLE IF NOT EXISTS` nao altera tabela existente, entao cada coluna
 * nova entra aqui, de forma idempotente.
 */
function aplicarMigracoes(banco) {
  const colunas = (tabela) =>
    new Set(banco.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name));

  const atestado = colunas('atestado');
  if (!atestado.has('efeito')) {
    banco.exec("ALTER TABLE atestado ADD COLUMN efeito TEXT NOT NULL DEFAULT 'abona'");
  }
  if (!atestado.has('motivo_efeito')) {
    banco.exec("ALTER TABLE atestado ADD COLUMN motivo_efeito TEXT NOT NULL DEFAULT ''");
  }
}

/** Fecha a conexao (usado nos testes). */
export function fecharDb() {
  if (instancia) {
    instancia.close();
    instancia = null;
  }
}

/** Executa `fn` dentro de uma transacao. */
export function emTransacao(fn) {
  return db().transaction(fn)();
}
