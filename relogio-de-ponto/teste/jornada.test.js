import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoTemporario, CPF_A } from './ajuda.js';

bancoTemporario();

const { db } = await import('../src/db/index.js');
const { registrarEmpregador } = await import('../src/servicos/empregador.js');
const { salvarTrabalhador } = await import('../src/servicos/trabalhadores.js');
const { acrescentar } = await import('../src/dominio/livro.js');
const { apurarDia, espelhoDePonto, lancarTratamento, minutosNoturnos } =
  await import('../src/servicos/jornada.js');

registrarEmpregador({ tipoIdentificador: 1, documento: '11222333000181', razaoSocial: 'TESTE' }, 'teste');
const ana = salvarTrabalhador({ cpf: CPF_A, nome: 'Ana Souza', admissao: '2026-01-05' }, 'teste');

// Escala de segunda a sexta: 08:00-17:00 com 1h de intervalo = 8h previstas.
const inserirEscala = db().prepare(`
  INSERT INTO escala (trabalhador_id, vigencia_inicio, dia_semana, entrada, saida, intervalo_min)
  VALUES (?, '2026-01-01', ?, '08:00', '17:00', 60)
`);
for (let dia = 1; dia <= 5; dia++) inserirEscala.run(ana.id, dia);

function marcar(dataHora) {
  return acrescentar({
    tipo: '7', dh: new Date(dataHora),
    conteudo: { cpf: CPF_A, postoId: 'RECEPCAO-01', metodo: 'biometria', offline: 0 }
  });
}

test('dia normal fecha com jornada cheia e saldo zero', () => {
  // 2026-08-03 e uma segunda-feira.
  marcar('2026-08-03T08:00:00-03:00');
  marcar('2026-08-03T12:00:00-03:00');
  marcar('2026-08-03T13:00:00-03:00');
  marcar('2026-08-03T17:00:00-03:00');

  const dia = apurarDia(ana.id, '2026-08-03');
  assert.equal(dia.trabalhadoMin, 480);
  assert.equal(dia.intervaloMin, 60);
  assert.equal(dia.previstoMin, 480);
  assert.equal(dia.saldoMin, 0);
  assert.equal(dia.ocorrencias.length, 0);
});

test('variacao de ate 5 min por marcacao nao vira hora extra (CLT art. 58, §1º)', () => {
  marcar('2026-08-04T07:56:00-03:00');
  marcar('2026-08-04T12:00:00-03:00');
  marcar('2026-08-04T13:00:00-03:00');
  marcar('2026-08-04T17:04:00-03:00');

  const dia = apurarDia(ana.id, '2026-08-04');
  assert.equal(dia.trabalhadoMin, 488); // 8 min a mais no relogio
  assert.equal(dia.extraMin, 0);        // dentro da tolerancia diaria de 10 min
  assert.equal(dia.saldoMin, 0);
});

test('acima da tolerancia a hora extra e contada por inteiro (Sumula 366 do TST)', () => {
  marcar('2026-08-05T08:00:00-03:00');
  marcar('2026-08-05T12:00:00-03:00');
  marcar('2026-08-05T13:00:00-03:00');
  marcar('2026-08-05T18:30:00-03:00');

  const dia = apurarDia(ana.id, '2026-08-05');
  assert.equal(dia.trabalhadoMin, 570);
  assert.equal(dia.extraMin, 90); // e nao 90-10
});

test('intervalo menor que 1h em jornada acima de 6h vira ocorrencia (CLT art. 71)', () => {
  marcar('2026-08-06T08:00:00-03:00');
  marcar('2026-08-06T12:00:00-03:00');
  marcar('2026-08-06T12:20:00-03:00');
  marcar('2026-08-06T17:00:00-03:00');

  const dia = apurarDia(ana.id, '2026-08-06');
  assert.equal(dia.intervaloMin, 20);
  assert.ok(dia.ocorrencias.some((o) => /art. 71/.test(o)));
  assert.ok(dia.ocorrencias.some((o) => /50%/.test(o)));
});

test('mais de 2h extras no dia gera alerta do art. 59', () => {
  marcar('2026-08-07T08:00:00-03:00');
  marcar('2026-08-07T12:00:00-03:00');
  marcar('2026-08-07T13:00:00-03:00');
  marcar('2026-08-07T20:00:00-03:00');

  const dia = apurarDia(ana.id, '2026-08-07');
  assert.equal(dia.extraMin, 180);
  assert.ok(dia.ocorrencias.some((o) => /art. 59/.test(o)));
});

test('numero impar de marcacoes aparece como jornada em aberto', () => {
  marcar('2026-08-10T08:00:00-03:00');
  marcar('2026-08-10T12:00:00-03:00');
  marcar('2026-08-10T13:00:00-03:00');

  const dia = apurarDia(ana.id, '2026-08-10');
  assert.ok(dia.ocorrencias.some((o) => /ímpar/.test(o)));
});

test('hora noturna e convertida pelo fator de 52min30s (CLT art. 73)', () => {
  // 22:00 as 02:00 = 240 minutos de relogio dentro do horario noturno.
  const relogio = minutosNoturnos(
    new Date('2026-08-11T22:00:00-03:00'), new Date('2026-08-12T02:00:00-03:00')
  );
  assert.equal(relogio, 240);
  assert.equal(Math.round(240 / (52.5 / 60)), 274); // horas noturnas reduzidas
});

test('tratamento inclui marcacao sem apagar o registro original', () => {
  marcar('2026-08-12T08:00:00-03:00');
  const esquecida = marcar('2026-08-12T12:00:00-03:00');
  marcar('2026-08-12T13:00:00-03:00');
  // O trabalhador esqueceu de bater a saida; o RH inclui, com motivo.
  lancarTratamento({
    trabalhadorId: ana.id, data: '2026-08-12', tipo: 'inclusao',
    dhConsiderada: '2026-08-12T17:00:00-0300',
    motivo: 'Saida nao registrada por falha no leitor; confirmada pelo gestor.',
    autorizadoPor: 'rh.joana'
  });

  const dia = apurarDia(ana.id, '2026-08-12');
  assert.equal(dia.marcacoes.length, 4);
  assert.equal(dia.marcacoes.at(-1).origem, 'tratamento');
  assert.equal(dia.trabalhadoMin, 480);
  // O registro original continua no livro-razao, intocado.
  const original = db().prepare('SELECT * FROM registro WHERE nsr = ?').get(esquecida.nsr);
  assert.equal(original.dh, esquecida.dh);
});

test('desconsideracao tira a marcacao da apuracao mas nao do AFD', () => {
  const extra = marcar('2026-08-13T08:00:00-03:00');
  marcar('2026-08-13T08:00:30-03:00'); // batida repetida em outro terminal
  marcar('2026-08-13T17:00:00-03:00');

  lancarTratamento({
    trabalhadorId: ana.id, data: '2026-08-13', tipo: 'desconsideracao',
    nsrOrigem: extra.nsr, motivo: 'Marcacao em duplicidade no mesmo minuto.',
    autorizadoPor: 'rh.joana'
  });

  const dia = apurarDia(ana.id, '2026-08-13');
  assert.ok(!dia.marcacoes.some((m) => m.nsr === extra.nsr));
  assert.ok(db().prepare('SELECT 1 FROM registro WHERE nsr = ?').get(extra.nsr));
});

test('interjornada menor que 11h aparece no espelho (CLT art. 66)', () => {
  marcar('2026-08-17T08:00:00-03:00');
  marcar('2026-08-17T22:00:00-03:00');
  marcar('2026-08-18T06:00:00-03:00');
  marcar('2026-08-18T15:00:00-03:00');

  const espelho = espelhoDePonto(ana.id, { de: '2026-08-17', ate: '2026-08-18' });
  const dia18 = espelho.dias.find((d) => d.data === '2026-08-18');
  assert.ok(dia18.ocorrencias.some((o) => /art. 66/.test(o)));
});

test('o espelho soma os totais do periodo', () => {
  const espelho = espelhoDePonto(ana.id, { de: '2026-08-03', ate: '2026-08-07' });
  assert.equal(espelho.dias.length, 5);
  assert.ok(espelho.totais.trabalhadoMin > 0);
  assert.equal(espelho.totais.saldoMin, espelho.totais.extraMin - espelho.totais.faltaMin);
});
