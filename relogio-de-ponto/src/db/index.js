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
  return instancia;
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
