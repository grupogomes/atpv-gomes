import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoTemporario, CPF_A, CPF_B } from './ajuda.js';

bancoTemporario();

const { db } = await import('../src/db/index.js');
const { registrarEmpregador } = await import('../src/servicos/empregador.js');
const { salvarTrabalhador } = await import('../src/servicos/trabalhadores.js');
const { acrescentar } = await import('../src/dominio/livro.js');
const { apurarDia } = await import('../src/servicos/jornada.js');
const {
  salvarAtestado, avaliarAtestado, listarAtestados, lerCid,
  resumoDashboard, minutosAbonados, diasCorridos, ErroAtestado
} = await import('../src/servicos/atestados.js');
const { NATUREZAS, efeitoPadrao } = await import('../src/dominio/naturezas.js');

test('o efeito padrão de cada natureza segue a lei', () => {
  // Art. 473 da CLT diz "sem prejuizo do salario" -> abona.
  assert.equal(efeitoPadrao('doacao_sangue'), 'abona');
  assert.equal(efeitoPadrao('acompanhamento_filho'), 'abona');
  assert.equal(efeitoPadrao('acompanhamento_gestacao'), 'abona');
  // Atestado medico de incapacidade -> abona.
  assert.equal(efeitoPadrao('doenca_propria'), 'abona');
  assert.equal(efeitoPadrao('acidente_trabalho'), 'abona');
  // Declaracao de comparecimento -> justifica, mas nao obriga o abono.
  assert.equal(efeitoPadrao('consulta'), 'justifica');
  assert.equal(efeitoPadrao('outro'), 'justifica');
  // Toda natureza carrega o fundamento do efeito, para aparecer na tela.
  for (const n of Object.values(NATUREZAS)) assert.ok(n.fundamentoEfeito);
});

registrarEmpregador({ tipoIdentificador: 1, documento: '11222333000181', razaoSocial: 'TESTE' }, 'x');
const ana = salvarTrabalhador({ cpf: CPF_A, nome: 'Ana Souza' }, 'x');
const bruno = salvarTrabalhador({ cpf: CPF_B, nome: 'Bruno Lima' }, 'x');

// Escala de segunda a sexta: 08:00-17:00 com 1h de intervalo = 8h previstas.
for (let dia = 1; dia <= 5; dia++) {
  db().prepare(`INSERT INTO escala (trabalhador_id,vigencia_inicio,dia_semana,entrada,saida,intervalo_min)
                VALUES (?, '2026-01-01', ?, '08:00','17:00',60)`).run(ana.id, dia);
}

const marcar = (dh) => acrescentar({
  tipo: '7', dh: new Date(dh),
  conteudo: { cpf: CPF_A, postoId: 'RECEPCAO-01', metodo: 'biometria', offline: 0 }
});

test('contagem de dias corridos inclui as duas pontas', () => {
  assert.equal(diasCorridos('2026-08-03', '2026-08-03'), 1);
  assert.equal(diasCorridos('2026-08-03', '2026-08-05'), 3);
  assert.equal(diasCorridos('2026-08-28', '2026-09-02'), 6); // atravessa o mes
});

test('atestado nasce pendente e so abona depois de aceito', () => {
  const atestado = salvarAtestado({
    trabalhadorId: ana.id, tipo: 'dias', natureza: 'doenca_propria',
    dataInicio: '2026-08-03', dataFim: '2026-08-03', emitente: 'Dra. Marina', conselho: 'CRM/SP 11111'
  }, 'rh.joana');

  assert.equal(atestado.situacao, 'pendente');
  assert.equal(atestado.dias, 1);

  // Pendente nao abona: o dia sem marcacao continua como falta cheia.
  let dia = apurarDia(ana.id, '2026-08-03');
  assert.equal(dia.abonadoMin, 0);
  assert.equal(dia.faltaMin, 480);

  avaliarAtestado({ id: atestado.id, situacao: 'aceito' }, 'rh.joana');

  dia = apurarDia(ana.id, '2026-08-03');
  assert.equal(dia.abonadoMin, 480);
  assert.equal(dia.faltaMin, 0);
  assert.equal(dia.saldoMin, 0);
  assert.ok(dia.ocorrencias.some((o) => /abonada por atestado/.test(o)));
});

test('atestado de horas do art. 473 abona apenas as horas do documento', () => {
  // Trabalhou das 08:00 as 14:00 (6h) e saiu para acompanhar filho em consulta.
  // CLT art. 473, XI: ausencia permitida "sem prejuizo do salario" -> abona.
  marcar('2026-08-04T08:00:00-03:00');
  marcar('2026-08-04T14:00:00-03:00');

  const atestado = salvarAtestado({
    trabalhadorId: ana.id, tipo: 'horas', natureza: 'acompanhamento_filho',
    dataInicio: '2026-08-04', horaInicio: '14:00', horaFim: '16:00',
    emitente: 'Clinica Central'
  }, 'rh.joana');
  assert.equal(atestado.efeito, 'abona');
  avaliarAtestado({ id: atestado.id, situacao: 'aceito' }, 'rh.joana');

  const dia = apurarDia(ana.id, '2026-08-04');
  assert.equal(dia.trabalhadoMin, 360);
  assert.equal(dia.abonadoMin, 120);
  // Faltaram 8h - 6h = 2h, cobertas pelo atestado: dia fecha zerado.
  assert.equal(dia.faltaMin, 0);
  assert.equal(dia.extraMin, 0);
});

test('declaração de comparecimento justifica, mas NAO abona', () => {
  // Consulta do proprio trabalhador, sem atestado de incapacidade: a lei nao
  // obriga o abono (TRT-3 e TRT-4). As horas seguem descontadas.
  marcar('2026-08-14T08:00:00-03:00');
  marcar('2026-08-14T14:00:00-03:00');

  const atestado = salvarAtestado({
    trabalhadorId: ana.id, tipo: 'horas', natureza: 'consulta',
    dataInicio: '2026-08-14', horaInicio: '14:00', horaFim: '16:00',
    emitente: 'Clinica Central'
  }, 'rh.joana');
  assert.equal(atestado.efeito, 'justifica');
  avaliarAtestado({ id: atestado.id, situacao: 'aceito' }, 'rh.joana');

  const dia = apurarDia(ana.id, '2026-08-14');
  assert.equal(dia.trabalhadoMin, 360);
  assert.equal(dia.abonadoMin, 0);          // nada abonado
  assert.equal(dia.justificadoMin, 120);    // mas a ausencia esta justificada
  assert.equal(dia.faltaMin, 120);          // as 2h seguem como desconto
  assert.equal(dia.faltaJustificadaMin, 120);
  assert.ok(dia.ocorrencias.some((o) => /sem abono/.test(o)));
});

test('o RH pode abonar a consulta, mas so com motivo registrado', () => {
  assert.throws(() => salvarAtestado({
    trabalhadorId: ana.id, tipo: 'horas', natureza: 'consulta',
    dataInicio: '2026-08-17', horaInicio: '09:00', horaFim: '11:00',
    efeito: 'abona'
  }, 'rh.joana'), /motivo registrado/);

  const atestado = salvarAtestado({
    trabalhadorId: ana.id, tipo: 'horas', natureza: 'consulta',
    dataInicio: '2026-08-17', horaInicio: '09:00', horaFim: '11:00',
    efeito: 'abona',
    motivoEfeito: 'CCT 2026/2027, cláusula 22: abono de até 4h/mês para consulta.'
  }, 'rh.joana');

  assert.equal(atestado.efeito, 'abona');
  assert.match(atestado.motivo_efeito, /cláusula 22/);
});

test('atestado médico de incapacidade parcial abona, diferente da declaração', () => {
  // Quando o documento atesta INCAPACIDADE por parte do dia, e atestado
  // medico com efeito parcial — abona, ainda que sejam poucas horas.
  marcar('2026-08-18T08:00:00-03:00');
  marcar('2026-08-18T13:00:00-03:00');

  const atestado = salvarAtestado({
    trabalhadorId: ana.id, tipo: 'horas', natureza: 'doenca_propria',
    dataInicio: '2026-08-18', horaInicio: '13:00', horaFim: '17:00',
    emitente: 'Dra. Marina', conselho: 'CRM/SP 148220'
  }, 'rh.joana');
  assert.equal(atestado.efeito, 'abona');
  avaliarAtestado({ id: atestado.id, situacao: 'aceito' }, 'rh.joana');

  const dia = apurarDia(ana.id, '2026-08-18');
  assert.equal(dia.abonadoMin, 180); // faltavam 3h para fechar as 8h
  assert.equal(dia.faltaMin, 0);
});

test('atestado nunca vira hora extra: o abono para no que faltou', () => {
  // Jornada cheia trabalhada E um atestado de 2h no mesmo dia.
  marcar('2026-08-05T08:00:00-03:00');
  marcar('2026-08-05T12:00:00-03:00');
  marcar('2026-08-05T13:00:00-03:00');
  marcar('2026-08-05T17:00:00-03:00');

  const atestado = salvarAtestado({
    trabalhadorId: ana.id, tipo: 'horas', natureza: 'consulta',
    dataInicio: '2026-08-05', horaInicio: '07:00', horaFim: '09:00'
  }, 'rh.joana');
  avaliarAtestado({ id: atestado.id, situacao: 'aceito' }, 'rh.joana');

  const dia = apurarDia(ana.id, '2026-08-05');
  assert.equal(dia.trabalhadoMin, 480);
  assert.equal(dia.abonadoMin, 0);   // nao faltou nada, entao nada a abonar
  assert.equal(dia.extraMin, 0);
  assert.equal(dia.saldoMin, 0);
});

test('abono parcial cobre so a diferenca, mesmo com atestado maior', () => {
  const resultado = minutosAbonados({
    trabalhadorId: ana.id, data: '2026-08-06', previstoMin: 480, trabalhadoMin: 420
  });
  assert.ok(resultado.minutos <= 60);
});

test('atestado recusado exige motivo e nao abona', () => {
  const atestado = salvarAtestado({
    trabalhadorId: ana.id, tipo: 'dias', natureza: 'doenca_propria',
    dataInicio: '2026-08-10', dataFim: '2026-08-10'
  }, 'rh.joana');

  assert.throws(
    () => avaliarAtestado({ id: atestado.id, situacao: 'recusado', motivo: 'nao' }, 'rh.joana'),
    ErroAtestado
  );

  avaliarAtestado({
    id: atestado.id, situacao: 'recusado',
    motivo: 'Documento sem identificação do profissional emitente.'
  }, 'rh.joana');

  const dia = apurarDia(ana.id, '2026-08-10');
  assert.equal(dia.abonadoMin, 0);
  assert.equal(dia.faltaMin, 480);
});

test('validacoes de periodo e horario', () => {
  assert.throws(() => salvarAtestado({
    trabalhadorId: ana.id, tipo: 'dias', natureza: 'doenca_propria',
    dataInicio: '2026-08-10', dataFim: '2026-08-05'
  }, 'rh.joana'), /anterior/);

  assert.throws(() => salvarAtestado({
    trabalhadorId: ana.id, tipo: 'horas', natureza: 'consulta',
    dataInicio: '2026-08-11', horaInicio: '16:00', horaFim: '14:00'
  }, 'rh.joana'), /posterior/);

  assert.throws(() => salvarAtestado({
    trabalhadorId: ana.id, tipo: 'dias', natureza: 'inventada',
    dataInicio: '2026-08-11'
  }, 'rh.joana'), /natureza/i);
});

test('o CID fica cifrado no banco e toda leitura vai para a auditoria', () => {
  const atestado = salvarAtestado({
    trabalhadorId: bruno.id, tipo: 'dias', natureza: 'doenca_propria',
    dataInicio: '2026-08-12', dataFim: '2026-08-12', cid: 'J11'
  }, 'rh.joana');

  const bruto = db().prepare('SELECT cid_cifr FROM atestado WHERE id = ?').get(atestado.id);
  assert.ok(!Buffer.from(bruto.cid_cifr).includes(Buffer.from('J11')));

  // A listagem nunca carrega o CID junto — so a marca de que existe.
  const listado = listarAtestados({ de: '2026-08-01', ate: '2026-08-31' })
    .find((a) => a.id === atestado.id);
  assert.equal(listado.cid_cifr, undefined);
  assert.equal(listado.temCid, true);

  const antes = db().prepare("SELECT COUNT(*) c FROM auditoria WHERE acao='atestado.cid.leitura'").get().c;
  assert.equal(lerCid(atestado.id, 'rh.joana'), 'J11');
  const depois = db().prepare("SELECT COUNT(*) c FROM auditoria WHERE acao='atestado.cid.leitura'").get().c;
  assert.equal(depois, antes + 1);
});

test('painel agrega dias, horas, ranking e serie mensal', () => {
  const painel = resumoDashboard({ de: '2026-08-01', ate: '2026-08-31' });

  assert.ok(painel.totais.atestados >= 3);
  assert.ok(painel.totais.dias >= 1);
  // Minutos ABONADOS e minutos apenas JUSTIFICADOS sao contados separados.
  assert.ok(painel.totais.minutos >= 120);
  assert.ok(painel.totais.minutosJustificados >= 120);
  assert.ok(painel.totais.soJustificam >= 1);
  assert.ok(painel.ranking.length >= 1);
  // Ranking vem ordenado por dias, decrescente.
  for (let i = 1; i < painel.ranking.length; i++) {
    assert.ok(painel.ranking[i - 1].dias >= painel.ranking[i].dias);
  }
  assert.ok(painel.serieMensal.every((m) => /^\d{4}-\d{2}$/.test(m.mes)));
});

test('atestado pendente entra na contagem, mas nao nos dias abonados', () => {
  const antes = resumoDashboard({ de: '2027-01-01', ate: '2027-01-31' });
  assert.equal(antes.totais.atestados, 0);
  assert.equal(antes.totais.dias, 0);

  const atestado = salvarAtestado({
    trabalhadorId: ana.id, tipo: 'dias', natureza: 'doenca_propria',
    dataInicio: '2027-01-05', dataFim: '2027-01-07'
  }, 'rh.joana');

  const pendente = resumoDashboard({ de: '2027-01-01', ate: '2027-01-31' });
  assert.equal(pendente.totais.atestados, 1);
  assert.equal(pendente.totais.pendentes, 1);
  // Ainda nao abonou nada: nem dias, nem linha no ranking, nem serie mensal.
  assert.equal(pendente.totais.dias, 0);
  assert.equal(pendente.ranking.length, 0);
  assert.equal(pendente.serieMensal.length, 0);

  avaliarAtestado({ id: atestado.id, situacao: 'aceito' }, 'rh.joana');

  const aceito = resumoDashboard({ de: '2027-01-01', ate: '2027-01-31' });
  assert.equal(aceito.totais.dias, 3);
  assert.equal(aceito.totais.pendentes, 0);
  assert.equal(aceito.ranking.length, 1);
});

test('atestado recusado nao conta nos dias, mas continua listado', () => {
  const atestado = salvarAtestado({
    trabalhadorId: bruno.id, tipo: 'dias', natureza: 'doenca_propria',
    dataInicio: '2027-02-08', dataFim: '2027-02-10'
  }, 'rh.joana');
  avaliarAtestado({
    id: atestado.id, situacao: 'recusado',
    motivo: 'Atestado ilegível, sem identificação do emitente.'
  }, 'rh.joana');

  const painel = resumoDashboard({ de: '2027-02-01', ate: '2027-02-28' });
  assert.equal(painel.totais.atestados, 1);
  assert.equal(painel.totais.recusados, 1);
  assert.equal(painel.totais.dias, 0);
  assert.equal(painel.ranking.length, 0);
  // Segue visivel na tabela, com o motivo — nada some do historico.
  assert.equal(painel.atestados.length, 1);
  assert.match(painel.atestados[0].motivo_recusa, /ilegível/);
});

test('o painel conta so a parte do atestado que cai dentro do periodo', () => {
  const atestado = salvarAtestado({
    trabalhadorId: bruno.id, tipo: 'dias', natureza: 'doenca_propria',
    dataInicio: '2026-09-28', dataFim: '2026-10-05' // 8 dias, a cavalo entre dois meses
  }, 'rh.joana');
  avaliarAtestado({ id: atestado.id, situacao: 'aceito' }, 'rh.joana');

  const setembro = resumoDashboard({ de: '2026-09-01', ate: '2026-09-30' });
  const linhaBruno = setembro.ranking.find((r) => r.trabalhadorId === bruno.id);
  assert.equal(linhaBruno.dias, 3); // 28, 29 e 30 de setembro

  const outubro = resumoDashboard({ de: '2026-10-01', ate: '2026-10-31' });
  assert.equal(outubro.ranking.find((r) => r.trabalhadorId === bruno.id).dias, 5);
});

test('afastamento de 15 dias ou mais alerta sobre o encaminhamento ao INSS', () => {
  const atestado = salvarAtestado({
    trabalhadorId: bruno.id, tipo: 'dias', natureza: 'doenca_propria',
    dataInicio: '2026-11-02', dataFim: '2026-11-20' // 19 dias
  }, 'rh.joana');
  avaliarAtestado({ id: atestado.id, situacao: 'aceito' }, 'rh.joana');

  const painel = resumoDashboard({ de: '2026-11-01', ate: '2026-11-30' });
  const alerta = painel.alertas.find((a) => a.nivel === 'critical');
  assert.ok(alerta, 'deveria haver alerta critico');
  assert.match(alerta.texto, /INSS/);
  assert.match(alerta.texto, /8\.213/);
});

test('atestados pendentes aparecem como alerta de atencao', () => {
  salvarAtestado({
    trabalhadorId: ana.id, tipo: 'dias', natureza: 'doacao_sangue',
    dataInicio: '2026-12-01', dataFim: '2026-12-01'
  }, 'rh.joana');

  const painel = resumoDashboard({ de: '2026-12-01', ate: '2026-12-31' });
  assert.equal(painel.totais.pendentes, 1);
  assert.ok(painel.alertas.some((a) => a.nivel === 'warning' && /aguardando/.test(a.texto)));
});
