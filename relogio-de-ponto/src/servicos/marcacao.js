import { db } from '../db/index.js';
import { config } from '../config.js';
import { acrescentar, listarRegistros } from '../dominio/livro.js';
import { paraDH, dataLocal, deDH } from '../dominio/datas.js';
import { normalizarCpf } from '../dominio/cpf.js';
import { buscarPorId, buscarPorCpf } from './trabalhadores.js';
import { candidatosAtivos } from './biometria.js';
import { driver } from '../biometria/index.js';
import { registrarAuditoria } from './auditoria.js';
import { ErroBiometria } from '../biometria/driver.js';

export class ErroMarcacao extends Error {
  constructor(mensagem, codigo = 'MARCACAO_RECUSADA') {
    super(mensagem);
    this.codigo = codigo;
  }
}

/**
 * Metodos de identificacao aceitos, em ordem de preferencia.
 *  - 'biometria'   : digital, 1:N. Padrao e unico metodo do dia a dia.
 *  - 'alternativo' : credencial pessoal + autorizacao de supervisor. Usado
 *                    quando a digital nao le (curativo, dedo desgastado).
 *                    Sempre gera evento auditavel.
 */
export const METODOS = ['biometria', 'alternativo'];

/**
 * Registra uma marcacao de ponto.
 *
 * Regra que atravessa toda esta funcao: se a pessoa foi identificada, a
 * marcacao E GRAVADA. O REP-P nao decide se o horario "pode" — a Portaria MTP
 * 671/2021 veda restringir a marcacao e veda marcacao automatica. Julgamento
 * de atraso, hora extra e intervalo acontece depois, no tratamento (AEJ), sem
 * jamais tocar no registro original.
 *
 * @param {object} entrada
 * @param {number} entrada.trabalhadorId
 * @param {string} entrada.postoId       posto autenticado que originou
 * @param {string} entrada.metodo        'biometria' | 'alternativo'
 * @param {number} [entrada.score]       confianca da biometria (0-100)
 * @param {string} [entrada.justificativa] obrigatoria no metodo alternativo
 * @param {string} [entrada.autorizadoPor] supervisor, no metodo alternativo
 * @param {boolean} [entrada.offline]    marcacao coletada offline e sincronizada
 * @param {Date}   [entrada.dh]          data/hora do fato (offline)
 */
export function registrarMarcacao(entrada) {
  const trabalhador = buscarPorId(entrada.trabalhadorId);
  if (!trabalhador) throw new ErroMarcacao('Trabalhador não encontrado.', 'DESCONHECIDO');
  if (!trabalhador.ativo) {
    throw new ErroMarcacao('Cadastro inativo. Procure o RH.', 'INATIVO');
  }
  if (!METODOS.includes(entrada.metodo)) {
    throw new ErroMarcacao('Método de identificação inválido.', 'METODO_INVALIDO');
  }
  if (entrada.metodo === 'alternativo') {
    if (!entrada.justificativa || String(entrada.justificativa).trim().length < 5) {
      throw new ErroMarcacao(
        'Marcação por credencial alternativa exige justificativa.', 'JUSTIFICATIVA'
      );
    }
    if (!entrada.autorizadoPor) {
      throw new ErroMarcacao(
        'Marcação por credencial alternativa exige autorização de supervisor.', 'AUTORIZACAO'
      );
    }
  }

  const quando = entrada.dh instanceof Date ? entrada.dh : new Date();

  // Duplo toque acidental no leitor: devolvemos o comprovante que ja existe em
  // vez de criar um segundo registro. Nao e bloqueio de horario — a janela e de
  // segundos e vale para o mesmo trabalhador no mesmo posto.
  const duplicada = marcacaoRecente(trabalhador.cpf, quando);
  if (duplicada) {
    return { ...duplicada, repetida: true };
  }

  const conteudo = {
    cpf: trabalhador.cpf,
    postoId: String(entrada.postoId || ''),
    metodo: entrada.metodo,
    offline: entrada.offline ? 1 : 0
  };
  if (entrada.metodo === 'biometria' && entrada.score !== undefined) {
    conteudo.score = Math.round(entrada.score);
  }
  if (entrada.metodo === 'alternativo') {
    conteudo.justificativa = String(entrada.justificativa).trim();
    conteudo.autorizadoPor = String(entrada.autorizadoPor);
  }

  const registro = acrescentar({ tipo: '7', dh: quando, conteudo });

  if (entrada.metodo === 'alternativo') {
    // Evento sensivel: fica no proprio AFD, tipo "6", e nao so no log interno.
    acrescentar({
      tipo: '6',
      dh: quando,
      conteudo: {
        evento: 'IDENTIFICACAO_ALTERNATIVA',
        cpf: trabalhador.cpf,
        nsrRelacionado: registro.nsr,
        autorizadoPor: conteudo.autorizadoPor,
        justificativa: conteudo.justificativa
      }
    });
    registrarAuditoria({
      ator: conteudo.autorizadoPor,
      acao: 'marcacao.alternativa',
      alvo: trabalhador.cpf,
      detalhe: `NSR ${registro.nsr}: ${conteudo.justificativa}`
    });
  }

  return {
    nsr: registro.nsr,
    dh: registro.dh,
    dhGravacao: registro.dhGravacao,
    hash: registro.hash,
    cpf: trabalhador.cpf,
    nome: trabalhador.nome,
    metodo: entrada.metodo,
    postoId: conteudo.postoId,
    repetida: false
  };
}

/** Marcacao do mesmo CPF dentro da janela antiduplicidade, se houver. */
function marcacaoRecente(cpf, quando) {
  const limite = new Date(quando.getTime() - config.janelaAntiDuplicidadeSegundos * 1000);
  const linha = db().prepare(`
    SELECT * FROM registro
     WHERE tipo = '7' AND cpf = ? AND dh >= ? AND dh <= ?
     ORDER BY nsr DESC LIMIT 1
  `).get(cpf, paraDH(limite), paraDH(quando));
  if (!linha) return null;
  const conteudo = JSON.parse(linha.conteudo);
  const trabalhador = buscarPorCpf(cpf);
  return {
    nsr: linha.nsr,
    dh: linha.dh,
    dhGravacao: linha.dh_gravacao,
    hash: linha.hash,
    cpf,
    nome: trabalhador?.nome || '',
    metodo: conteudo.metodo,
    postoId: conteudo.postoId
  };
}

/**
 * Identifica quem encostou o dedo no leitor e registra a marcacao.
 * Fluxo completo do quiosque: capturar -> comparar 1:N -> gravar -> comprovante.
 */
export async function baterPontoPorBiometria({ postoId }) {
  const leitor = driver();
  const captura = await leitor.capturar({ timeoutMs: 20000 });
  const candidatos = candidatosAtivos();
  if (candidatos.length === 0) {
    throw new ErroBiometria('Nenhuma biometria cadastrada no sistema.', 'SEM_CADASTRO');
  }

  const resultado = await leitor.identificar(captura.template, candidatos);
  if (!resultado.encontrado || (resultado.score ?? 0) < config.biometria.scoreMinimo) {
    throw new ErroBiometria(
      'Digital não reconhecida. Tente outro dedo ou procure o supervisor.',
      'NAO_RECONHECIDO'
    );
  }

  return registrarMarcacao({
    trabalhadorId: resultado.trabalhadorId,
    postoId,
    metodo: 'biometria',
    score: resultado.score
  });
}

/** Marcacoes de um CPF em um intervalo (para espelho e comprovantes). */
export function marcacoesDoTrabalhador(cpf, { inicio, fim }) {
  return listarRegistros({ inicio, fim, tipos: ['7'] })
    .filter((r) => r.conteudo.cpf === normalizarCpf(cpf));
}

/** Marcacoes de um dia, agrupadas por CPF. */
export function marcacoesDoDia(data) {
  const registros = listarRegistros({
    inicio: `${data}T00:00:00${config.fuso.replace(':', '')}`,
    fim: `${data}T23:59:59${config.fuso.replace(':', '')}`,
    tipos: ['7']
  });
  const porCpf = new Map();
  for (const registro of registros) {
    const lista = porCpf.get(registro.conteudo.cpf) || [];
    lista.push(registro);
    porCpf.set(registro.conteudo.cpf, lista);
  }
  return porCpf;
}

/**
 * Sentido presumido (entrada/saida) por alternancia. Existe apenas para exibir
 * no espelho: o AFD guarda so o instante da marcacao, e a Portaria nao admite
 * que o registrador classifique a marcacao no momento em que ela e feita.
 */
export function sentidoPresumido(marcacoesDoDiaOrdenadas) {
  return marcacoesDoDiaOrdenadas.map((registro, indice) => ({
    ...registro,
    sentido: indice % 2 === 0 ? 'entrada' : 'saida',
    hora: registro.dh.slice(11, 16),
    data: dataLocal(deDH(registro.dh))
  }));
}
