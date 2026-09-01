import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/**
 * ===========================================================================
 * Banco de dados: SQLite EMBUTIDO no proprio Node.
 * ===========================================================================
 * Antes usavamos o better-sqlite3, que e um modulo NATIVO: precisa de binario
 * compilado para cada combinacao de sistema, arquitetura e versao do Node.
 * Na pratica isso significava que a instalacao numa maquina comum de
 * escritorio podia exigir Python e compilador C++ — e foi exatamente onde ela
 * travou em campo.
 *
 * O Node traz SQLite embutido desde a versao 22.5. Usando-o, o sistema passa
 * a ter ZERO dependencias nativas: nada para compilar, nada para baixar de
 * binario, nada que quebre ao trocar a versao do Node.
 *
 * `process.getBuiltinModule` obtem o modulo de forma sincrona e sem exigir
 * flag de linha de comando.
 */

// O Node marca o node:sqlite como experimental e imprime um aviso a cada
// inicializacao. A parcela da API que usamos aqui (DatabaseSync, prepare,
// run/get/all, exec) e estavel; filtramos apenas esse aviso, deixando todos
// os demais visiveis.
const emitirAvisoOriginal = process.emitWarning;
process.emitWarning = function (aviso, ...resto) {
  const texto = typeof aviso === 'string' ? aviso : (aviso?.message || '');
  const tipo = typeof resto[0] === 'string' ? resto[0] : resto[0]?.type;
  if (tipo === 'ExperimentalWarning' && /sqlite/i.test(texto)) return;
  return emitirAvisoOriginal.call(process, aviso, ...resto);
};

const sqlite = process.getBuiltinModule?.('node:sqlite');
if (!sqlite?.DatabaseSync) {
  throw new Error(
    `Este sistema precisa do SQLite embutido no Node.js, disponivel a partir da ` +
    `versao 22.5. Versao encontrada: ${process.version}. Atualize o Node.js.`
  );
}

let instancia = null;

/**
 * Envolve o banco do Node para oferecer a mesma interface que o resto do
 * sistema ja usa: prepare, exec, transaction e close.
 */
function envolver(bruto) {
  // Profundidade de transacao: o SQLite nao aninha BEGIN, entao a partir do
  // segundo nivel usamos SAVEPOINT.
  let nivel = 0;

  return {
    bruto,
    prepare: (sql) => bruto.prepare(sql),
    exec: (sql) => bruto.exec(sql),
    close: () => bruto.close(),

    /**
     * Executa `fn` dentro de uma transacao, desfazendo tudo se ela lancar.
     * Devolve uma funcao, como no better-sqlite3, para nao mudar as chamadas.
     */
    transaction(fn) {
      return (...argumentos) => {
        const marca = `ponto_${nivel}`;
        bruto.exec(nivel === 0 ? 'BEGIN' : `SAVEPOINT ${marca}`);
        nivel += 1;
        try {
          const resultado = fn(...argumentos);
          nivel -= 1;
          bruto.exec(nivel === 0 ? 'COMMIT' : `RELEASE ${marca}`);
          return resultado;
        } catch (erro) {
          nivel -= 1;
          try {
            bruto.exec(nivel === 0 ? 'ROLLBACK' : `ROLLBACK TO ${marca}`);
          } catch { /* a transacao ja pode ter sido desfeita pelo proprio erro */ }
          throw erro;
        }
      };
    }
  };
}

/** Abre (e cria, se preciso) o banco, aplicando o esquema. */
export function db() {
  if (instancia) return instancia;
  fs.mkdirSync(path.dirname(config.banco), { recursive: true });

  const bruto = new sqlite.DatabaseSync(config.banco);
  bruto.exec('PRAGMA journal_mode = WAL');
  bruto.exec('PRAGMA foreign_keys = ON');
  bruto.exec(fs.readFileSync(path.join(aqui, 'schema.sql'), 'utf8'));

  instancia = envolver(bruto);
  aplicarMigracoes(instancia);
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

/**
 * Copia consistente do banco, para backup. `VACUUM INTO` e SQL puro: funciona
 * em qualquer versao e, ao contrario de copiar o arquivo, nao corre o risco de
 * pegar o banco no meio de uma escrita (o modo WAL guarda parte dos dados em
 * arquivo separado).
 */
export function copiarBanco(destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (fs.existsSync(destino)) fs.unlinkSync(destino);
  db().exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  return destino;
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
