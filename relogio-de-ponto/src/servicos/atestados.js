import { db } from '../db/index.js';
import { paraDH } from '../dominio/datas.js';
import { cifrar, decifrar } from '../seguranca/cripto.js';
import { registrarAuditoria } from './auditoria.js';
import { buscarPorId } from './trabalhadores.js';
import { NATUREZAS, CHAVES_NATUREZA } from '../dominio/naturezas.js';

export class ErroAtestado extends Error {
  constructor(mensagem) { super(mensagem); this.codigo = 'ATESTADO_INVALIDO'; }
}

/** Soma de dias corridos entre duas datas AAAA-MM-DD, inclusive nas pontas. */
export function diasCorridos(de, ate) {
  const inicio = Date.parse(`${de}T12:00:00Z`);
  const fim = Date.parse(`${ate}T12:00:00Z`);
  if (Number.isNaN(inicio) || Number.isNaN(fim)) throw new ErroAtestado('Data inválida.');
  return Math.floor((fim - inicio) / 86400000) + 1;
}

function minutosDeHora(hora) {
  const [h, m] = String(hora).split(':').map(Number);
  return h * 60 + m;
}

/**
 * Registra um atestado. Nasce como 'pendente': quem lança não é quem valida,
 * para que a aceitação fique sempre registrada com nome e data.
 */
export function salvarAtestado(dados, ator, ip = '') {
  const trabalhador = buscarPorId(Number(dados.trabalhadorId));
  if (!trabalhador) throw new ErroAtestado('Trabalhador não encontrado.');

  const tipo = dados.tipo === 'horas' ? 'horas' : 'dias';
  const natureza = CHAVES_NATUREZA.includes(dados.natureza) ? dados.natureza : null;
  if (!natureza) throw new ErroAtestado('Informe a natureza do atestado.');

  const dataInicio = String(dados.dataInicio || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) throw new ErroAtestado('Data inicial inválida.');

  let dataFim = dataInicio;
  let dias = 0;
  let minutos = 0;
  let horaInicio = null;
  let horaFim = null;

  if (tipo === 'dias') {
    dataFim = String(dados.dataFim || dataInicio).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataFim)) throw new ErroAtestado('Data final inválida.');
    dias = diasCorridos(dataInicio, dataFim);
    if (dias < 1) throw new ErroAtestado('A data final não pode ser anterior à inicial.');
    if (dias > 180) throw new ErroAtestado('Período acima de 180 dias: registre como afastamento previdenciário.');
  } else {
    horaInicio = String(dados.horaInicio || '').slice(0, 5);
    horaFim = String(dados.horaFim || '').slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(horaInicio) || !/^\d{2}:\d{2}$/.test(horaFim)) {
      throw new ErroAtestado('Informe hora inicial e final (HH:MM).');
    }
    minutos = minutosDeHora(horaFim) - minutosDeHora(horaInicio);
    if (minutos <= 0) throw new ErroAtestado('A hora final deve ser posterior à inicial.');
    if (minutos > 24 * 60) throw new ErroAtestado('Intervalo maior que um dia.');
  }

  // O CID e opcional. Se vier, entra cifrado — nunca em texto claro no banco.
  const cid = String(dados.cid || '').trim();

  const agora = paraDH(new Date());
  const info = db().prepare(`
    INSERT INTO atestado (trabalhador_id, tipo, natureza, data_inicio, data_fim,
      hora_inicio, hora_fim, dias, minutos, emitente, conselho, cid_cifr,
      observacao, arquivo, entregue_em, registrado_por, registrado_em)
    VALUES (@trabalhadorId, @tipo, @natureza, @dataInicio, @dataFim,
      @horaInicio, @horaFim, @dias, @minutos, @emitente, @conselho, @cid,
      @observacao, @arquivo, @entregueEm, @ator, @agora)
  `).run({
    trabalhadorId: trabalhador.id, tipo, natureza, dataInicio, dataFim,
    horaInicio, horaFim, dias, minutos,
    emitente: String(dados.emitente || '').trim(),
    conselho: String(dados.conselho || '').trim(),
    cid: cid ? cifrar(Buffer.from(cid, 'utf8')) : null,
    observacao: String(dados.observacao || '').trim(),
    arquivo: dados.arquivo || null,
    entregueEm: dados.entregueEm || null,
    ator, agora
  });

  registrarAuditoria({
    ator, acao: 'atestado.registro', alvo: `trabalhador:${trabalhador.id}`,
    detalhe: `${tipo} · ${natureza} · ${dataInicio}${tipo === 'dias' ? ` a ${dataFim}` : ` ${horaInicio}-${horaFim}`}`,
    ip
  });

  return buscarAtestado(info.lastInsertRowid);
}

/** Aceita ou recusa um atestado. Recusa exige motivo. */
export function avaliarAtestado({ id, situacao, motivo = '' }, ator, ip = '') {
  if (!['aceito', 'recusado'].includes(situacao)) throw new ErroAtestado('Situação inválida.');
  if (situacao === 'recusado' && String(motivo).trim().length < 5) {
    throw new ErroAtestado('Recusar um atestado exige motivo registrado.');
  }
  const atestado = buscarAtestado(id);
  if (!atestado) throw new ErroAtestado('Atestado não encontrado.');

  db().prepare(`
    UPDATE atestado SET situacao = ?, motivo_recusa = ?, avaliado_por = ?, avaliado_em = ?
     WHERE id = ?
  `).run(situacao, situacao === 'recusado' ? String(motivo).trim() : null,
    ator, paraDH(new Date()), id);

  registrarAuditoria({
    ator, acao: `atestado.${situacao}`, alvo: `atestado:${id}`,
    detalhe: situacao === 'recusado' ? String(motivo).trim() : '', ip
  });
  return buscarAtestado(id);
}

export function buscarAtestado(id) {
  const linha = db().prepare(`
    SELECT a.*, t.nome, t.cpf, t.matricula
      FROM atestado a JOIN trabalhador t ON t.id = a.trabalhador_id
     WHERE a.id = ?
  `).get(id);
  return linha ? semCid(linha) : null;
}

/**
 * Remove o CID do objeto devolvido. Ele nunca viaja junto da listagem: quem
 * precisar ver pede explicitamente, e a leitura fica na auditoria.
 */
function semCid(linha) {
  const { cid_cifr, ...resto } = linha;
  return { ...resto, temCid: Boolean(cid_cifr && cid_cifr.length) };
}

/** Lê o CID de um atestado. Toda leitura é auditada (LGPD, dado sensível). */
export function lerCid(id, ator, ip = '') {
  const linha = db().prepare('SELECT cid_cifr FROM atestado WHERE id = ?').get(id);
  if (!linha?.cid_cifr?.length) return null;
  registrarAuditoria({
    ator, acao: 'atestado.cid.leitura', alvo: `atestado:${id}`,
    detalhe: 'acesso a dado de saúde', ip
  });
  return decifrar(linha.cid_cifr).toString('utf8');
}

/** Lista atestados que tocam o período informado. */
export function listarAtestados({ de, ate, trabalhadorId = null, situacao = null } = {}) {
  const filtros = [];
  const params = [];
  if (de) { filtros.push('a.data_fim >= ?'); params.push(de); }
  if (ate) { filtros.push('a.data_inicio <= ?'); params.push(ate); }
  if (trabalhadorId) { filtros.push('a.trabalhador_id = ?'); params.push(trabalhadorId); }
  if (situacao) { filtros.push('a.situacao = ?'); params.push(situacao); }
  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  return db().prepare(`
    SELECT a.*, t.nome, t.cpf, t.matricula
      FROM atestado a JOIN trabalhador t ON t.id = a.trabalhador_id
      ${onde}
     ORDER BY a.data_inicio DESC, a.id DESC
  `).all(...params).map(semCid);
}

/**
 * Atestados ACEITOS que cobrem um dia especifico. E o que a apuracao de
 * jornada consulta — atestado pendente ou recusado nao abona nada.
 */
export function atestadosDoDia(trabalhadorId, data) {
  return db().prepare(`
    SELECT * FROM atestado
     WHERE trabalhador_id = ? AND situacao = 'aceito'
       AND data_inicio <= ? AND data_fim >= ?
     ORDER BY id
  `).all(trabalhadorId, data, data).map(semCid);
}

/**
 * Minutos abonados em um dia, dado o previsto da escala.
 *
 * Regra central: o abono cobre no maximo o que faltou. Atestado nunca gera
 * hora extra nem credito de banco de horas.
 */
export function minutosAbonados({ trabalhadorId, data, previstoMin, trabalhadoMin }) {
  const faltando = Math.max(previstoMin - trabalhadoMin, 0);
  if (faltando === 0) return { minutos: 0, atestados: [] };

  const atestados = atestadosDoDia(trabalhadorId, data);
  if (atestados.length === 0) return { minutos: 0, atestados: [] };

  let cobertura = 0;
  for (const atestado of atestados) {
    cobertura += atestado.tipo === 'dias' ? previstoMin : atestado.minutos;
  }
  return { minutos: Math.min(cobertura, faltando), atestados };
}

/**
 * Números do painel de atestados para um período.
 *
 * Devolve os totais, o ranking por trabalhador (dias e horas), a série mensal
 * e os alertas que o RH precisa ver — tudo já agregado, para o navegador só
 * desenhar.
 */
export function resumoDashboard({ de, ate }) {
  const atestados = listarAtestados({ de, ate });
  const aceitos = atestados.filter((a) => a.situacao === 'aceito');
  const pendentes = atestados.filter((a) => a.situacao === 'pendente');

  const porTrabalhador = new Map();
  const porMes = new Map();

  // So o que ja foi ACEITO conta como abonado. Atestado pendente ainda nao
  // abonou nada — ele aparece no alerta e na tabela, nunca nos totais.
  for (const atestado of aceitos) {
    const chave = atestado.trabalhador_id;
    const atual = porTrabalhador.get(chave) || {
      trabalhadorId: chave, nome: atestado.nome, cpf: atestado.cpf,
      matricula: atestado.matricula, dias: 0, minutos: 0, quantidade: 0,
      maiorSequencia: 0, naturezas: new Set()
    };
    // Contamos apenas a parte do atestado que cai dentro do periodo pedido.
    const inicio = atestado.data_inicio > de ? atestado.data_inicio : de;
    const fim = atestado.data_fim < ate ? atestado.data_fim : ate;
    const diasNoPeriodo = atestado.tipo === 'dias' ? diasCorridos(inicio, fim) : 0;

    atual.dias += diasNoPeriodo;
    atual.minutos += atestado.tipo === 'horas' ? atestado.minutos : 0;
    atual.quantidade += 1;
    atual.maiorSequencia = Math.max(atual.maiorSequencia, atestado.dias);
    atual.naturezas.add(atestado.natureza);
    porTrabalhador.set(chave, atual);

    const mes = atestado.data_inicio.slice(0, 7);
    const linhaMes = porMes.get(mes) || { mes, dias: 0, minutos: 0, quantidade: 0 };
    linhaMes.dias += diasNoPeriodo;
    linhaMes.minutos += atestado.tipo === 'horas' ? atestado.minutos : 0;
    linhaMes.quantidade += 1;
    porMes.set(mes, linhaMes);
  }

  const ranking = [...porTrabalhador.values()]
    .map((t) => ({ ...t, naturezas: [...t.naturezas] }))
    .sort((a, b) => (b.dias - a.dias) || (b.minutos - a.minutos));

  // Alertas acionaveis, com o fundamento junto para o RH nao ter que procurar.
  const alertas = [];
  if (pendentes.length) {
    alertas.push({
      nivel: 'warning',
      texto: `${pendentes.length} atestado(s) aguardando conferência do RH.`
    });
  }
  for (const t of ranking) {
    const limite = NATUREZAS.doenca_propria.limiteEmpresaDias;
    if (t.maiorSequencia >= limite) {
      alertas.push({
        nivel: 'critical',
        texto: `${t.nome}: afastamento de ${t.maiorSequencia} dias. A partir do 16º dia ` +
               'consecutivo o benefício passa ao INSS (Lei 8.213/1991, art. 60, §3º) — ' +
               'encaminhe o requerimento.'
      });
    }
  }

  const totalDias = ranking.reduce((s, t) => s + t.dias, 0);
  const totalMinutos = ranking.reduce((s, t) => s + t.minutos, 0);

  return {
    periodo: { de, ate },
    totais: {
      atestados: atestados.length,
      aceitos: aceitos.length,
      pendentes: pendentes.length,
      recusados: atestados.filter((a) => a.situacao === 'recusado').length,
      dias: totalDias,
      minutos: totalMinutos,
      pessoas: ranking.length
    },
    ranking,
    serieMensal: [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
    alertas,
    atestados
  };
}
