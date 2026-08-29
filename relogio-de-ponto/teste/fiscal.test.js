import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoTemporario, CPF_A, CPF_B } from './ajuda.js';

bancoTemporario();

const { db } = await import('../src/db/index.js');
const { registrarEmpregador } = await import('../src/servicos/empregador.js');
const { salvarTrabalhador } = await import('../src/servicos/trabalhadores.js');
const { acrescentar } = await import('../src/dominio/livro.js');
const { gerarAfd, conferirAfd, montarLinha } = await import('../src/fiscal/afd.js');
const { LEIAUTE_AFD, tamanhoBase } = await import('../src/fiscal/leiaute.js');
const { gerarAej } = await import('../src/fiscal/aej.js');
const { config } = await import('../src/config.js');

registrarEmpregador({
  tipoIdentificador: 1, documento: '11222333000181',
  razaoSocial: 'EMPRESA DE TESTE LTDA', endereco: 'Rua Um, 10'
}, 'teste');

const ana = salvarTrabalhador({ cpf: CPF_A, nome: 'Ana Souza', matricula: '001', admissao: '2026-01-05' }, 'teste');
const bruno = salvarTrabalhador({ cpf: CPF_B, nome: 'Bruno Lima', matricula: '002', admissao: '2026-01-05' }, 'teste');

for (const [cpf, hora] of [[CPF_A, '08:00'], [CPF_A, '12:00'], [CPF_A, '13:00'], [CPF_A, '17:00'], [CPF_B, '09:03']]) {
  acrescentar({
    tipo: '7',
    dh: new Date(`2026-08-03T${hora}:00-03:00`),
    conteudo: { cpf, postoId: 'RECEPCAO-01', metodo: 'biometria', offline: 0, score: 92 }
  });
}

test('toda linha do AFD tem o tamanho declarado no leiaute', () => {
  const afd = gerarAfd({
    inicio: new Date('2026-08-01T00:00:00-03:00'),
    fim: new Date('2026-08-31T23:59:59-03:00')
  });
  const linhas = afd.conteudo.split('\r\n').filter(Boolean);

  for (const linha of linhas) {
    const tipo = linha[9];
    const definicao = LEIAUTE_AFD[tipo];
    assert.ok(definicao, `tipo de registro inesperado: ${tipo}`);
    const esperado = tamanhoBase(tipo) + (definicao.verificador === 'crc16' ? 4 : 64);
    assert.equal(linha.length, esperado, `linha do tipo ${tipo} com tamanho errado`);
  }
});

test('o AFD comeca com cabecalho e termina com trailer', () => {
  const afd = gerarAfd({
    inicio: new Date('2026-08-01T00:00:00-03:00'),
    fim: new Date('2026-08-31T23:59:59-03:00')
  });
  const linhas = afd.conteudo.split('\r\n').filter(Boolean);
  assert.equal(linhas[0][9], '1');
  assert.equal(linhas.at(-1)[9], '9');
  assert.ok(linhas.at(-1).startsWith('999999999'));
});

test('o trailer conta corretamente as marcacoes do periodo', () => {
  const afd = gerarAfd({
    inicio: new Date('2026-08-01T00:00:00-03:00'),
    fim: new Date('2026-08-31T23:59:59-03:00')
  });
  assert.equal(afd.contagem[7], 5);
  assert.equal(afd.contagem[5], 2); // duas inclusoes de empregado
  const trailer = afd.conteudo.split('\r\n').filter(Boolean).at(-1);
  // qtdTipo7 e o 6º campo de 9 posicoes depois de nsr(9)+tipo(1).
  assert.equal(trailer.slice(10 + 5 * 9, 10 + 6 * 9), '000000005');
});

test('os verificadores do AFD conferem em todas as linhas', () => {
  const afd = gerarAfd({
    inicio: new Date('2026-08-01T00:00:00-03:00'),
    fim: new Date('2026-08-31T23:59:59-03:00')
  });
  const conferencia = conferirAfd(afd.conteudo);
  assert.equal(conferencia.valido, true, JSON.stringify(conferencia.problemas));
});

test('um byte trocado no AFD e detectado pela conferencia', () => {
  const afd = gerarAfd({
    inicio: new Date('2026-08-01T00:00:00-03:00'),
    fim: new Date('2026-08-31T23:59:59-03:00')
  });
  const linhas = afd.conteudo.split('\r\n').filter(Boolean);
  const alvo = linhas.findIndex((l) => l[9] === '7');
  // Muda a hora da marcacao sem recalcular o hash — como faria uma fraude.
  linhas[alvo] = linhas[alvo].slice(0, 21) + '9' + linhas[alvo].slice(22);
  const conferencia = conferirAfd(linhas.join('\r\n'));
  assert.equal(conferencia.valido, false);
  assert.ok(conferencia.problemas.some((p) => p.linha === alvo + 1));
});

test('campos alfanumericos sao truncados e completados, nunca deslocam a linha', () => {
  const linha = montarLinha(5, {
    nsr: 7, tipoRegistro: 5, operacao: 'I',
    dh: '2026-08-03T08:00:00-0300', cpf: CPF_A,
    nome: 'Nome Absurdamente Longo '.repeat(10)
  });
  assert.equal(linha.length, tamanhoBase(5) + 4);
});

test('o AEJ sai com cabecalho, trabalhadores e trailer', () => {
  db().prepare(`
    INSERT INTO escala (trabalhador_id, vigencia_inicio, dia_semana, entrada, saida, intervalo_min)
    VALUES (?, '2026-01-01', 1, '08:00', '17:00', 60)
  `).run(ana.id);

  const aej = gerarAej({ de: '2026-08-01', ate: '2026-08-05' });
  const linhas = aej.conteudo.split('\r\n').filter(Boolean);
  assert.equal(linhas[0][0], '1');
  assert.equal(linhas.at(-1)[0], '9');
  assert.equal(aej.contagem[2], 2);          // Ana e Bruno
  assert.ok(aej.contagem[4] >= 5);           // marcacoes consideradas
});

test('o AFD nao vaza registros fora do periodo pedido', () => {
  acrescentar({
    tipo: '7', dh: new Date('2026-09-10T08:00:00-03:00'),
    conteudo: { cpf: CPF_A, postoId: 'RECEPCAO-01', metodo: 'biometria', offline: 0 }
  });
  const agosto = gerarAfd({
    inicio: new Date('2026-08-01T00:00:00-03:00'),
    fim: new Date('2026-08-31T23:59:59-03:00')
  });
  assert.equal(agosto.contagem[7], 5);
});

test('a identificacao do REP vai no cabecalho', () => {
  const afd = gerarAfd({
    inicio: new Date('2026-08-01T00:00:00-03:00'),
    fim: new Date('2026-08-31T23:59:59-03:00')
  });
  const cabecalho = afd.conteudo.split('\r\n')[0];
  assert.ok(cabecalho.includes(config.rep.identificacao));
  assert.ok(cabecalho.includes('EMPRESA DE TESTE LTDA'));
});
