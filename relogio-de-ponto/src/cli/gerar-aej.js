import fs from 'node:fs';
import path from 'node:path';
import { gerarAej, nomeArquivoAej } from '../fiscal/aej.js';
import { assinarSePossivel } from '../fiscal/assinatura.js';
import { db } from '../db/index.js';
import { paraDH } from '../dominio/datas.js';

const [, , de, ate, destino = './saida'] = process.argv;
if (!de || !ate) {
  console.error('Uso: npm run aej -- 2026-08-01 2026-08-31 [pasta]');
  process.exit(1);
}

db();
const aej = gerarAej({ de, ate });
const nome = nomeArquivoAej(de, ate);
fs.mkdirSync(destino, { recursive: true });
const caminho = path.join(destino, nome);
fs.writeFileSync(caminho, assinarSePossivel(Buffer.from(aej.conteudo, 'latin1'), { tipo: 'cades' }));

db().prepare(`
  INSERT INTO exportacao (tipo, inicio, fim, arquivo, sha256, gerado_por, gerado_em)
  VALUES ('AEJ', ?, ?, ?, ?, 'cli', ?)
`).run(de, ate, nome, aej.sha256, paraDH(new Date()));

console.log(`AEJ gerado: ${caminho}`);
console.log(`  linhas .: ${aej.linhas}`);
console.log(`  SHA-256 : ${aej.sha256}`);
