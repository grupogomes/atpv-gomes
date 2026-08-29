import { provisionarPosto } from '../servicos/postos.js';
import { db } from '../db/index.js';

const [, , id, ...resto] = process.argv;
if (!id) {
  console.error('Uso: npm run posto -- RECEPCAO-01 "Recepcao - terminal 1"');
  process.exit(1);
}

db();
const { token } = provisionarPosto({ id, nome: resto.join(' ') || id, ator: 'cli' });

console.log('\nPosto provisionado.');
console.log(`  ID ....: ${id.toUpperCase()}`);
console.log(`  Token .: ${token}`);
console.log('\nAbra /kiosk/ NESTE computador e cole ID e token uma unica vez.');
console.log('O token nao pode ser consultado depois — apenas reemitido.\n');
