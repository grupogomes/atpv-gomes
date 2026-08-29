import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { db } from './index.js';
import { config } from '../config.js';
import { registrarEmpregador } from '../servicos/empregador.js';
import { criarUsuario, existeAdmin } from '../servicos/usuarios.js';
import { provisionarPosto } from '../servicos/postos.js';

/**
 * Primeira configuracao: empregador, administrador e o primeiro posto.
 * Roda uma vez, de forma interativa, para nao deixar senha padrao no codigo.
 */
const banco = db();
const rl = readline.createInterface({ input: stdin, output: stdout });

console.log('\n=== Configuracao inicial do REP-P ===\n');

if (config.empregador.documento) {
  registrarEmpregador(config.empregador, 'seed');
  console.log(`Empregador: ${config.empregador.razaoSocial}`);
} else {
  console.log('Aviso: preencha os dados do empregador no .env e rode `npm run migrar`.\n');
}

if (existeAdmin()) {
  console.log('Ja existe administrador cadastrado — pulando.');
} else {
  const login = (await rl.question('Login do administrador: ')).trim();
  const nome = (await rl.question('Nome completo: ')).trim();
  const senha = (await rl.question('Senha (minimo 10 caracteres): ')).trim();
  criarUsuario({ login, nome, senha, papel: 'admin' }, 'seed');
  console.log(`Administrador "${login}" criado.`);
}

const criarPosto = (await rl.question('\nProvisionar um posto agora? (s/N) ')).trim().toLowerCase();
if (criarPosto === 's') {
  const id = (await rl.question('Identificador do posto (ex.: RECEPCAO-01): ')).trim();
  const nome = (await rl.question('Nome do posto: ')).trim();
  const { token } = provisionarPosto({ id, nome, ator: 'seed' });
  console.log('\n--- GUARDE ESTE TOKEN, ele nao pode ser consultado depois ---');
  console.log(`Posto : ${id.toUpperCase()}`);
  console.log(`Token : ${token}`);
  console.log('------------------------------------------------------------');
}

rl.close();
console.log('\nPronto. Suba o sistema com `npm start`.\n');
banco.close();
