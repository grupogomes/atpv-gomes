import { db } from './index.js';
import { config } from '../config.js';
import { registrarEmpregador } from '../servicos/empregador.js';

const banco = db();
console.log(`Banco pronto em ${config.banco}`);

if (config.empregador.documento) {
  registrarEmpregador(config.empregador, 'migracao');
  console.log(`Empregador registrado: ${config.empregador.razaoSocial}`);
} else {
  console.log('Aviso: EMPREGADOR_DOCUMENTO nao configurado — defina no .env antes de usar em producao.');
}

const total = banco.prepare('SELECT COUNT(*) c FROM registro').get().c;
console.log(`Registros no livro-razao: ${total}`);
