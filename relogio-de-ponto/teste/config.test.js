import test from 'node:test';
import assert from 'node:assert/strict';

import { valorDaLinha, numero } from '../src/config.js';

// O .env.exemplo trazia "EMPREGADOR_TIPO_ID=1   # 1 = CNPJ, 2 = CPF". O
// comentario entrava no valor, Number() dava NaN e a instalacao morria com
// "NOT NULL constraint failed: empregador.tipo_identificador". Estes testes
// existem para que isso nao volte.
test('comentario na mesma linha nao entra no valor', () => {
  assert.equal(valorDaLinha('1                # 1 = CNPJ, 2 = CPF'), '1');
  assert.equal(valorDaLinha('3000  # porta do servidor'), '3000');
  assert.equal(valorDaLinha('  0.0.0.0   '), '0.0.0.0');
});

test('cerquilha colada no valor e parte do valor', () => {
  // Senha e chave podem conter "#". So abre comentario com espaco antes.
  assert.equal(valorDaLinha('senha#forte'), 'senha#forte');
  assert.equal(valorDaLinha('abc#123#xyz'), 'abc#123#xyz');
});

test('aspas preservam o valor literal', () => {
  assert.equal(valorDaLinha('"senha com espaco  "'), 'senha com espaco  ');
  assert.equal(valorDaLinha("'valor # com cerquilha'"), 'valor # com cerquilha');
  assert.equal(valorDaLinha('"a"  # comentario'), 'a');
});

test('valor vazio continua vazio', () => {
  assert.equal(valorDaLinha(''), '');
  assert.equal(valorDaLinha('   # so comentario'), '');
});

test('numero cai na reserva quando o valor nao e numero', () => {
  assert.equal(numero('1', 9), 1);
  assert.equal(numero('1 # CNPJ', 9), 9);
  assert.equal(numero('', 9), 9);
  assert.equal(numero(undefined, 9), 9);
  assert.equal(numero(' 22 ', 9), 22);
});
