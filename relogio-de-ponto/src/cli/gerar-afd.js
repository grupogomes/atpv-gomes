import fs from 'node:fs';
import path from 'node:path';
import { gerarAfd, nomeArquivoAfd } from '../fiscal/afd.js';
import { assinarSePossivel } from '../fiscal/assinatura.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { paraDH } from '../dominio/datas.js';

const [, , de, ate, destino = './saida'] = process.argv;
if (!de || !ate) {
  console.error('Uso: npm run afd -- 2026-08-01 2026-08-31 [pasta]');
  process.exit(1);
}

db();
const inicio = new Date(`${de}T00:00:00${config.fuso}`);
const fim = new Date(`${ate}T23:59:59${config.fuso}`);
const afd = gerarAfd({ inicio, fim });
const nome = nomeArquivoAfd(inicio, fim);

fs.mkdirSync(destino, { recursive: true });
const caminho = path.join(destino, nome);
fs.writeFileSync(caminho, assinarSePossivel(Buffer.from(afd.conteudo, 'latin1'), { tipo: 'cades' }));

db().prepare(`
  INSERT INTO exportacao (tipo, inicio, fim, nsr_inicial, nsr_final, arquivo, sha256, gerado_por, gerado_em)
  VALUES ('AFD', ?, ?, ?, ?, ?, ?, 'cli', ?)
`).run(de, ate, afd.nsrInicial, afd.nsrFinal, nome, afd.sha256, paraDH(new Date()));

console.log(`AFD gerado: ${caminho}`);
console.log(`  linhas .: ${afd.linhas}`);
console.log(`  marcacoes: ${afd.contagem[7]}`);
console.log(`  SHA-256 : ${afd.sha256}`);
