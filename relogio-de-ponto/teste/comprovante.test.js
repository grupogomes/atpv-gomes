import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoTemporario, CPF_A } from './ajuda.js';

bancoTemporario();

const { registrarEmpregador } = await import('../src/servicos/empregador.js');
const { salvarTrabalhador } = await import('../src/servicos/trabalhadores.js');
const { registrarMarcacao } = await import('../src/servicos/marcacao.js');
const { comprovanteTexto, comprovantePdf, dadosComprovante } =
  await import('../src/fiscal/comprovante.js');
const { situacaoAssinatura } = await import('../src/fiscal/assinatura.js');

registrarEmpregador({
  tipoIdentificador: 1, documento: '11222333000181',
  razaoSocial: 'EMPRESA DE TESTE LTDA', endereco: 'Rua Um, 10 - Sao Paulo/SP'
}, 'teste');
const ana = salvarTrabalhador({ cpf: CPF_A, nome: 'Ana Souza' }, 'teste');
const marcacao = registrarMarcacao({
  trabalhadorId: ana.id, postoId: 'RECEPCAO-01', metodo: 'biometria', score: 95,
  dh: new Date('2026-08-03T08:00:00-03:00')
});

test('o comprovante traz tudo que a Portaria 671 exige', () => {
  const d = dadosComprovante(marcacao);
  assert.match(d.titulo, /COMPROVANTE DE REGISTRO DE PONTO DO TRABALHADOR/);
  assert.equal(d.empregadorNome, 'EMPRESA DE TESTE LTDA');
  assert.equal(d.empregadorDocumento, '11222333000181');
  assert.equal(d.trabalhadorNome, 'Ana Souza');
  assert.equal(d.trabalhadorCpf, '529.982.247-25');
  assert.equal(d.nsr.length, 9);
  assert.equal(d.dataLegivel, '03/08/2026');
  assert.equal(d.horaLegivel, '08:00:00');
  assert.equal(d.hash.length, 64);
  assert.ok(d.repIdentificacao);
});

test('a versao em texto cabe em 40 colunas da bobina termica', () => {
  const texto = comprovanteTexto(marcacao);
  for (const linha of texto.split('\n')) {
    assert.ok(linha.length <= 40, `linha larga demais: "${linha}"`);
  }
  assert.ok(texto.includes(marcacao.hash.slice(0, 40)));
});

test('o comprovante em PDF e gerado', async () => {
  const pdf = await comprovantePdf(marcacao);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 800);
});

test('o sistema avisa quando a assinatura ICP-Brasil nao esta configurada', () => {
  const situacao = situacaoAssinatura();
  assert.equal(situacao.ativa, false);
  assert.match(situacao.alerta, /ICP-Brasil/);
});
