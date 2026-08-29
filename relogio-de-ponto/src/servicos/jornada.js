import { db } from '../db/index.js';
import { config } from '../config.js';
import { deDH, paraDH, dataLocal, minutosEntre, minutosParaHHMM } from '../dominio/datas.js';
import { marcacoesDoTrabalhador } from './marcacao.js';
import { buscarPorId } from './trabalhadores.js';

/**
 * ===========================================================================
 * Apuracao da jornada
 * ===========================================================================
 * Nada aqui altera marcacao. Este modulo LE o livro-razao e produz o espelho
 * de ponto e os totais. Os parametros abaixo saem da CLT; convencao coletiva
 * mais benefica prevalece e deve ser configurada em `parametros`.
 */
export const PARAMETROS_CLT = {
  // Art. 58, §1º: variacao de ate 5 min por marcacao, limitada a 10 min/dia,
  // nao e computada como hora extra nem como atraso (Sumula 366 do TST).
  toleranciaPorMarcacaoMin: 5,
  toleranciaDiariaMin: 10,

  // Art. 71: intervalo minimo de 1h quando a jornada passa de 6h;
  // 15 min quando fica entre 4h e 6h.
  intervaloMinimoAcima6hMin: 60,
  intervaloMinimoEntre4e6hMin: 15,

  // Art. 66: minimo de 11h consecutivas entre duas jornadas.
  interjornadaMinimaMin: 660,

  // Art. 73: hora noturna urbana das 22h as 5h, computada como 52min30s,
  // com adicional minimo de 20%.
  noturnoInicioHora: 22,
  noturnoFimHora: 5,
  fatorHoraNoturna: 52.5 / 60,
  adicionalNoturnoPercentual: 20,

  // Art. 59: limite de 2h extras por dia. CF art. 7º, XVI: adicional minimo 50%.
  limiteExtraDiariaMin: 120,
  adicionalExtraPercentual: 50,

  // Art. 58: jornada padrao de 8h diarias / 44h semanais.
  jornadaPadraoDiariaMin: 480,
  jornadaPadraoSemanalMin: 2640
};

/** Escala vigente do trabalhador em uma data (AAAA-MM-DD). */
export function escalaDoDia(trabalhadorId, data) {
  const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();
  return db().prepare(`
    SELECT * FROM escala
     WHERE trabalhador_id = ? AND dia_semana = ?
       AND vigencia_inicio <= ?
       AND (vigencia_fim IS NULL OR vigencia_fim >= ?)
     ORDER BY vigencia_inicio DESC LIMIT 1
  `).get(trabalhadorId, diaSemana, data, data) || null;
}

/** Tratamentos lancados para o dia (inclusoes e desconsideracoes). */
export function tratamentosDoDia(trabalhadorId, data) {
  return db().prepare(
    'SELECT * FROM tratamento WHERE trabalhador_id = ? AND data = ? ORDER BY id'
  ).all(trabalhadorId, data);
}

/**
 * Minutos trabalhados dentro do horario noturno, ja convertidos pela hora
 * reduzida do art. 73 da CLT.
 */
export function minutosNoturnos(inicio, fim, parametros = PARAMETROS_CLT) {
  let noturnos = 0;
  // Varredura minuto a minuto: simples, exata nas viradas de dia e barata para
  // a escala de um dia de trabalho.
  for (let t = inicio.getTime(); t < fim.getTime(); t += 60000) {
    const hora = Number(paraDH(new Date(t)).slice(11, 13));
    if (hora >= parametros.noturnoInicioHora || hora < parametros.noturnoFimHora) {
      noturnos += 1;
    }
  }
  return noturnos;
}

/**
 * Apura um dia de trabalho de um trabalhador.
 *
 * @returns {{
 *   data: string, marcacoes: Array, pares: Array, trabalhadoMin: number,
 *   intervaloMin: number, previstoMin: number, saldoMin: number,
 *   extraMin: number, noturnoMin: number, ocorrencias: string[]
 * }}
 */
export function apurarDia(trabalhadorId, data, parametros = PARAMETROS_CLT) {
  const trabalhador = buscarPorId(trabalhadorId);
  if (!trabalhador) throw new Error('Trabalhador nao encontrado.');

  const fusoCompacto = config.fuso.replace(':', '');
  const registros = marcacoesDoTrabalhador(trabalhador.cpf, {
    inicio: `${data}T00:00:00${fusoCompacto}`,
    fim: `${data}T23:59:59${fusoCompacto}`
  });

  const tratamentos = tratamentosDoDia(trabalhadorId, data);
  const desconsiderados = new Set(
    tratamentos.filter((t) => t.tipo === 'desconsideracao').map((t) => t.nsr_origem)
  );

  const marcacoes = registros
    .filter((r) => !desconsiderados.has(r.nsr))
    .map((r) => ({ nsr: r.nsr, dh: r.dh, origem: 'registro', metodo: r.conteudo.metodo }));

  // Inclusoes manuais entram identificadas como tal — o espelho mostra
  // claramente o que veio do leitor e o que foi lancado pelo RH.
  for (const tratamento of tratamentos.filter((t) => t.tipo === 'inclusao' && t.dh_considerada)) {
    marcacoes.push({
      nsr: null, dh: tratamento.dh_considerada, origem: 'tratamento',
      motivo: tratamento.motivo, autorizadoPor: tratamento.autorizado_por
    });
  }
  marcacoes.sort((a, b) => a.dh.localeCompare(b.dh));

  // Pareamento por alternancia: 1ª = entrada, 2ª = saida, e assim por diante.
  const pares = [];
  for (let i = 0; i + 1 < marcacoes.length; i += 2) {
    pares.push({ entrada: marcacoes[i], saida: marcacoes[i + 1] });
  }
  const marcacaoImpar = marcacoes.length % 2 === 1;

  let trabalhadoMin = 0;
  let noturnoBruto = 0;
  for (const par of pares) {
    const inicio = deDH(par.entrada.dh);
    const fim = deDH(par.saida.dh);
    const minutos = minutosEntre(inicio, fim);
    par.minutos = minutos;
    trabalhadoMin += minutos;
    noturnoBruto += minutosNoturnos(inicio, fim, parametros);
  }

  // Intervalo = tempo entre pares consecutivos.
  let intervaloMin = 0;
  for (let i = 0; i + 1 < pares.length; i++) {
    intervaloMin += minutosEntre(deDH(pares[i].saida.dh), deDH(pares[i + 1].entrada.dh));
  }

  const escala = escalaDoDia(trabalhadorId, data);
  const previstoMin = calcularPrevisto(escala);

  const ocorrencias = [];
  if (marcacaoImpar) ocorrencias.push('Número ímpar de marcações: jornada em aberto.');

  // Art. 71: intervalo intrajornada.
  if (trabalhadoMin > 360 && intervaloMin < parametros.intervaloMinimoAcima6hMin) {
    ocorrencias.push(
      `Intervalo intrajornada de ${minutosParaHHMM(intervaloMin)} para jornada acima de 6h ` +
      `(CLT art. 71: mínimo ${minutosParaHHMM(parametros.intervaloMinimoAcima6hMin)}). ` +
      'Período suprimido é devido com acréscimo de 50% (art. 71, §4º).'
    );
  } else if (trabalhadoMin > 240 && trabalhadoMin <= 360
             && intervaloMin < parametros.intervaloMinimoEntre4e6hMin) {
    ocorrencias.push(
      `Intervalo de ${minutosParaHHMM(intervaloMin)} para jornada entre 4h e 6h ` +
      `(CLT art. 71, §1º: mínimo 15 min).`
    );
  }

  // Art. 58, §1º: tolerancia. Aplicada sobre o saldo bruto do dia.
  const saldoBruto = previstoMin > 0 ? trabalhadoMin - previstoMin : 0;
  const toleranciaAplicavel = Math.min(
    parametros.toleranciaDiariaMin,
    parametros.toleranciaPorMarcacaoMin * Math.max(marcacoes.length, 0)
  );
  let saldoMin = saldoBruto;
  if (Math.abs(saldoBruto) <= toleranciaAplicavel) {
    saldoMin = 0;
  } else if (saldoBruto > 0) {
    saldoMin = saldoBruto; // acima da tolerancia, conta integralmente (Sumula 366 TST)
  }

  const extraMin = Math.max(saldoMin, 0);
  if (extraMin > parametros.limiteExtraDiariaMin) {
    ocorrencias.push(
      `Horas extras de ${minutosParaHHMM(extraMin)} no dia excedem o limite de 2h ` +
      '(CLT art. 59).'
    );
  }

  const noturnoMin = Math.round(noturnoBruto / parametros.fatorHoraNoturna);

  return {
    data,
    trabalhadorId,
    cpf: trabalhador.cpf,
    nome: trabalhador.nome,
    marcacoes,
    pares,
    trabalhadoMin,
    intervaloMin,
    previstoMin,
    saldoMin,
    extraMin,
    faltaMin: Math.max(-saldoMin, 0),
    // Minutos noturnos ja convertidos pela hora reduzida de 52min30s.
    noturnoMin,
    noturnoRelogioMin: noturnoBruto,
    ocorrencias,
    tratamentos
  };
}

function calcularPrevisto(escala) {
  if (!escala || !escala.entrada || !escala.saida) return 0;
  const [he, me] = escala.entrada.split(':').map(Number);
  const [hs, ms] = escala.saida.split(':').map(Number);
  let minutos = (hs * 60 + ms) - (he * 60 + me);
  if (minutos < 0) minutos += 24 * 60; // jornada que vira o dia
  return Math.max(minutos - (escala.intervalo_min || 0), 0);
}

/** Espelho de ponto de um periodo (art. 74 da CLT + Portaria 671). */
export function espelhoDePonto(trabalhadorId, { de, ate }, parametros = PARAMETROS_CLT) {
  const dias = [];
  const inicio = new Date(`${de}T12:00:00Z`);
  const fim = new Date(`${ate}T12:00:00Z`);
  for (let d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(apurarDia(trabalhadorId, d.toISOString().slice(0, 10), parametros));
  }

  // Art. 66: interjornada de 11h entre o fim de um dia e o inicio do seguinte.
  for (let i = 1; i < dias.length; i++) {
    const anterior = dias[i - 1];
    const atual = dias[i];
    const ultimaSaida = anterior.marcacoes.at(-1);
    const primeiraEntrada = atual.marcacoes[0];
    if (ultimaSaida && primeiraEntrada) {
      const descanso = minutosEntre(deDH(ultimaSaida.dh), deDH(primeiraEntrada.dh));
      if (descanso > 0 && descanso < parametros.interjornadaMinimaMin) {
        atual.ocorrencias.push(
          `Interjornada de ${minutosParaHHMM(descanso)} (CLT art. 66: mínimo 11h).`
        );
      }
    }
  }

  const totais = dias.reduce((acumulado, dia) => ({
    trabalhadoMin: acumulado.trabalhadoMin + dia.trabalhadoMin,
    previstoMin: acumulado.previstoMin + dia.previstoMin,
    extraMin: acumulado.extraMin + dia.extraMin,
    faltaMin: acumulado.faltaMin + dia.faltaMin,
    noturnoMin: acumulado.noturnoMin + dia.noturnoMin
  }), { trabalhadoMin: 0, previstoMin: 0, extraMin: 0, faltaMin: 0, noturnoMin: 0 });

  totais.saldoMin = totais.extraMin - totais.faltaMin;

  const trabalhador = buscarPorId(trabalhadorId);
  return { trabalhador, periodo: { de, ate }, dias, totais };
}

/** Lanca um tratamento de jornada, preservando a marcacao original. */
export function lancarTratamento({ trabalhadorId, data, tipo, nsrOrigem = null, dhConsiderada = null, motivo, autorizadoPor }) {
  if (!['inclusao', 'desconsideracao', 'justificativa'].includes(tipo)) {
    throw new Error('Tipo de tratamento inválido.');
  }
  if (!motivo || String(motivo).trim().length < 5) {
    throw new Error('Todo tratamento de jornada exige motivo registrado.');
  }
  if (!autorizadoPor) throw new Error('Todo tratamento exige responsável identificado.');

  db().prepare(`
    INSERT INTO tratamento (trabalhador_id, data, nsr_origem, tipo, dh_considerada, motivo, autorizado_por, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(trabalhadorId, data, nsrOrigem, tipo, dhConsiderada, String(motivo).trim(), autorizadoPor, paraDH(new Date()));
}

export { minutosParaHHMM, dataLocal };
