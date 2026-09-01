import path from 'node:path';
import fs from 'node:fs';
import { copiarBanco } from '../db/index.js';
import { config } from '../config.js';

/**
 * Copia de seguranca do banco.
 *
 * Usa VACUUM INTO, que produz uma copia consistente mesmo com o sistema em
 * uso. Copiar o arquivo .db na mao NAO serve: em modo WAL parte dos dados
 * fica num arquivo separado, e a copia sai truncada.
 *
 *   npm run backup                     -> ./backup/ponto-AAAAMMDD.db
 *   npm run backup -- D:\backup        -> D:\backup\ponto-AAAAMMDD.db
 *   npm run backup -- D:\backup 180    -> apaga copias com mais de 180 dias
 */
const [, , destinoArg, diasArg] = process.argv;
const pasta = path.resolve(destinoArg || './backup');
const manterDias = Number(diasArg || 180);

const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const arquivo = path.join(pasta, `ponto-${hoje}.db`);

copiarBanco(arquivo);
const tamanho = (fs.statSync(arquivo).size / 1048576).toFixed(1);
console.log(`Backup criado: ${arquivo} (${tamanho} MB)`);
console.log(`Banco de origem: ${config.banco}`);

if (Number.isFinite(manterDias) && manterDias > 0) {
  const limite = Date.now() - manterDias * 86400000;
  let removidos = 0;
  for (const nome of fs.readdirSync(pasta)) {
    if (!/^ponto-\d{8}\.db$/.test(nome)) continue;
    const caminho = path.join(pasta, nome);
    if (fs.statSync(caminho).mtimeMs < limite) { fs.unlinkSync(caminho); removidos += 1; }
  }
  if (removidos) console.log(`Copias com mais de ${manterDias} dias removidas: ${removidos}`);
}

console.log('\nGuarde tambem uma copia do .env, em local SEPARADO deste backup.');
console.log('Sem ele, as biometrias cadastradas nao voltam a funcionar.');
