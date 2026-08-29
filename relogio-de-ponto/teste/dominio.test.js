import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoTemporario } from './ajuda.js';

bancoTemporario();

const { crc16Kermit, crc16Hex } = await import('../src/dominio/crc16.js');
const { cpfValido, normalizarCpf, formatarCpf } = await import('../src/dominio/cpf.js');
const { paraDH, deDH, minutosParaHHMM } = await import('../src/dominio/datas.js');
const { dentroDoCidr, normalizarIp } = await import('../src/seguranca/rede.js');
const { canonico } = await import('../src/dominio/livro.js');

test('CRC-16/KERMIT bate com o vetor de referencia', () => {
  // Valor canonico para a cadeia "123456789" no CRC-16/KERMIT: 0x2189.
  assert.equal(crc16Kermit('123456789'), 0x2189);
  assert.equal(crc16Hex('123456789'), '2189');
  assert.equal(crc16Hex('').length, 4);
});

test('validacao de CPF', () => {
  assert.ok(cpfValido('529.982.247-25'));
  assert.ok(!cpfValido('111.111.111-11'));
  assert.ok(!cpfValido('529.982.247-24'));
  assert.ok(!cpfValido('123'));
  assert.equal(normalizarCpf('529.982.247-25'), '52998224725');
  assert.equal(formatarCpf('52998224725'), '529.982.247-25');
});

test('data/hora no formato do leiaute tem 24 posicoes e volta igual', () => {
  const quando = new Date('2021-04-27T19:44:00Z'); // 16:44 em -03:00
  const texto = paraDH(quando, '-03:00');
  assert.equal(texto, '2021-04-27T16:44:00-0300');
  assert.equal(texto.length, 24);
  assert.equal(deDH(texto).getTime(), quando.getTime());
});

test('minutos formatados aceitam negativos', () => {
  assert.equal(minutosParaHHMM(90), '01:30');
  assert.equal(minutosParaHHMM(-75), '-01:15');
  assert.equal(minutosParaHHMM(0), '00:00');
});

test('faixas de rede', () => {
  assert.ok(dentroDoCidr('192.168.1.55', '192.168.0.0/16'));
  assert.ok(dentroDoCidr('10.2.3.4', '10.0.0.0/8'));
  assert.ok(!dentroDoCidr('8.8.8.8', '192.168.0.0/16'));
  assert.ok(!dentroDoCidr('192.169.0.1', '192.168.0.0/16'));
  assert.equal(normalizarIp('::ffff:10.0.0.3'), '10.0.0.3');
  assert.equal(normalizarIp('::1'), '127.0.0.1');
});

test('serializacao canonica independe da ordem das chaves', () => {
  assert.equal(canonico({ b: 1, a: 2 }), canonico({ a: 2, b: 1 }));
  assert.equal(canonico({ a: [3, { z: 1, y: 2 }] }), '{"a":[3,{"y":2,"z":1}]}');
});
