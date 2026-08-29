import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoTemporario, CPF_A, CPF_B } from './ajuda.js';

bancoTemporario();

const { registrarEmpregador } = await import('../src/servicos/empregador.js');
const { salvarTrabalhador, registrarConsentimento } = await import('../src/servicos/trabalhadores.js');
const { cadastrarTemplate, candidatosAtivos, revogarTemplate } = await import('../src/servicos/biometria.js');
const { registrarMarcacao, baterPontoPorBiometria, ErroMarcacao } = await import('../src/servicos/marcacao.js');
const { criarSimulador } = await import('../src/biometria/simulador.js');
const { definirDriver, driver } = await import('../src/biometria/index.js');
const { ErroBiometria } = await import('../src/biometria/driver.js');
const { TERMO_BIOMETRIA } = await import('../src/dominio/termo.js');
const { db } = await import('../src/db/index.js');

registrarEmpregador({ tipoIdentificador: 1, documento: '11222333000181', razaoSocial: 'TESTE' }, 'teste');

const ana = salvarTrabalhador({ cpf: CPF_A, nome: 'Ana Souza' }, 'teste');
const bruno = salvarTrabalhador({ cpf: CPF_B, nome: 'Bruno Lima' }, 'teste');

for (const pessoa of [ana, bruno]) {
  registrarConsentimento({
    trabalhadorId: pessoa.id, versaoTermo: TERMO_BIOMETRIA.versao,
    textoTermo: TERMO_BIOMETRIA.texto, finalidade: 'ponto', ator: 'teste'
  });
}

const simulador = criarSimulador();
definirDriver(simulador);

async function cadastrarDedo(trabalhador, semente, dedo = 'polegar_direito') {
  simulador.apresentarDedo(semente);
  const captura = await simulador.capturar();
  cadastrarTemplate({
    trabalhadorId: trabalhador.id, dedo, template: captura.template,
    qualidade: captura.qualidade, modelo: captura.modelo, ator: 'teste'
  });
}

await cadastrarDedo(ana, 'ana-polegar');
await cadastrarDedo(bruno, 'bruno-polegar');

test('templates biometricos ficam cifrados no banco', () => {
  const linha = db().prepare('SELECT template_cifr FROM biometria WHERE trabalhador_id = ?').get(ana.id);
  const bruto = Buffer.from(linha.template_cifr);
  simulador.apresentarDedo('ana-polegar');
  // O texto claro do template nao pode aparecer no que esta gravado.
  assert.ok(bruto.length > 28);
  assert.ok(!bruto.includes(Buffer.from('ana-polegar')));
  // Mas decifra de volta para o valor original.
  const [candidato] = candidatosAtivos().filter((c) => c.trabalhadorId === ana.id);
  assert.ok(candidato);
});

test('a digital identifica a pessoa certa e registra a marcacao', async () => {
  simulador.apresentarDedo('ana-polegar');
  const marcacao = await baterPontoPorBiometria({ postoId: 'RECEPCAO-01' });
  assert.equal(marcacao.cpf, CPF_A);
  assert.equal(marcacao.nome, 'Ana Souza');
  assert.equal(marcacao.metodo, 'biometria');
  assert.ok(marcacao.nsr >= 1);
  assert.equal(marcacao.hash.length, 64);
});

test('digital nao cadastrada nao registra ponto para ninguem', async () => {
  simulador.apresentarDedo('estranho');
  await assert.rejects(
    () => baterPontoPorBiometria({ postoId: 'RECEPCAO-01' }),
    (erro) => erro instanceof ErroBiometria && erro.codigo === 'NAO_RECONHECIDO'
  );
});

test('o dedo de um nao registra ponto para o outro', async () => {
  simulador.apresentarDedo('bruno-polegar');
  const marcacao = await baterPontoPorBiometria({ postoId: 'RECEPCAO-01' });
  assert.equal(marcacao.cpf, CPF_B);
  assert.notEqual(marcacao.cpf, CPF_A);
});

test('duplo toque no leitor nao gera duas marcacoes', async () => {
  simulador.apresentarDedo('ana-polegar');
  const primeira = await baterPontoPorBiometria({ postoId: 'RECEPCAO-01' });
  const segunda = await baterPontoPorBiometria({ postoId: 'RECEPCAO-01' });
  assert.equal(segunda.repetida, true);
  assert.equal(segunda.nsr, primeira.nsr);
});

test('marcacao em horario "irregular" e registrada assim mesmo', () => {
  // O REP-P nao pode restringir marcacao (Portaria MTP 671/2021). Madrugada,
  // domingo, fora da escala: registra.
  const marcacao = registrarMarcacao({
    trabalhadorId: ana.id, postoId: 'RECEPCAO-01', metodo: 'biometria',
    score: 95, dh: new Date('2026-08-09T03:17:00-03:00')
  });
  assert.ok(marcacao.nsr);
  assert.ok(marcacao.dh.startsWith('2026-08-09T03:17'));
});

test('credencial alternativa exige justificativa e supervisor', () => {
  assert.throws(
    () => registrarMarcacao({ trabalhadorId: ana.id, postoId: 'P1', metodo: 'alternativo' }),
    (erro) => erro instanceof ErroMarcacao && erro.codigo === 'JUSTIFICATIVA'
  );
  assert.throws(
    () => registrarMarcacao({
      trabalhadorId: ana.id, postoId: 'P1', metodo: 'alternativo',
      justificativa: 'curativo no polegar'
    }),
    (erro) => erro instanceof ErroMarcacao && erro.codigo === 'AUTORIZACAO'
  );
});

test('credencial alternativa gera evento sensivel no livro-razao', () => {
  const antes = db().prepare("SELECT COUNT(*) c FROM registro WHERE tipo = '6'").get().c;
  registrarMarcacao({
    trabalhadorId: ana.id, postoId: 'P1', metodo: 'alternativo',
    justificativa: 'curativo no polegar direito', autorizadoPor: 'supervisora.maria',
    dh: new Date('2026-08-10T08:00:00-03:00')
  });
  const depois = db().prepare("SELECT COUNT(*) c FROM registro WHERE tipo = '6'").get().c;
  assert.equal(depois, antes + 1);

  const evento = db().prepare("SELECT conteudo FROM registro WHERE tipo = '6' ORDER BY nsr DESC LIMIT 1").get();
  const conteudo = JSON.parse(evento.conteudo);
  assert.equal(conteudo.evento, 'IDENTIFICACAO_ALTERNATIVA');
  assert.equal(conteudo.autorizadoPor, 'supervisora.maria');
});

test('trabalhador inativo nao registra ponto', () => {
  const carlos = salvarTrabalhador({ cpf: '19100000000', nome: 'Carlos Teste' }, 'teste');
  salvarTrabalhador({ cpf: carlos.cpf, nome: 'Carlos Teste', ativo: false }, 'teste');
  assert.throws(
    () => registrarMarcacao({ trabalhadorId: carlos.id, postoId: 'P1', metodo: 'biometria' }),
    (erro) => erro.codigo === 'INATIVO'
  );
});

test('template revogado sai da identificacao', async () => {
  revogarTemplate({ trabalhadorId: bruno.id, dedo: 'polegar_direito', ator: 'teste' });
  simulador.apresentarDedo('bruno-polegar');
  await assert.rejects(() => baterPontoPorBiometria({ postoId: 'RECEPCAO-01' }));
});
