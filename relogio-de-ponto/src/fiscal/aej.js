import crypto from 'node:crypto';
import { formatarCampo, normalizarTexto } from './leiaute.js';
import { crc16Hex } from '../dominio/crc16.js';
import { config } from '../config.js';
import { paraDH } from '../dominio/datas.js';
import { empregadorAtual } from '../servicos/empregador.js';
import { listarTrabalhadores } from '../servicos/trabalhadores.js';
import { espelhoDePonto, escalaDoDia } from '../servicos/jornada.js';

const CRLF = '\r\n';

/**
 * ===========================================================================
 * LEIAUTE DO AEJ — Arquivo Eletronico de Jornada (Portaria MTP nº 671/2021)
 * ===========================================================================
 * Mesma advertencia do AFD: o formato esta declarado so aqui. Confira contra o
 * Anexo da portaria antes de entregar a fiscalizacao (ver docs/HOMOLOGACAO.md).
 *
 * A diferenca conceitual entre os dois arquivos e o que da seguranca juridica
 * ao sistema:
 *   AFD = o que o REP-P registrou, cru e imutavel.
 *   AEJ = o que o empregador apurou a partir daquilo, com os tratamentos
 *         explicitados. Um nunca substitui o outro.
 */
const N = 'N';
const A = 'A';
const DH = 'DH';

export const LEIAUTE_AEJ = {
  // Tipo 1 — cabecalho
  1: [
    ['tipoRegistro', N, 1],
    ['tipoIdentificadorEmpregador', N, 1],
    ['identificadorEmpregador', N, 14],
    ['cnoCaepf', A, 12],
    ['razaoSocial', A, 150],
    ['dhInicial', DH, 24],
    ['dhFinal', DH, 24],
    ['dhGeracao', DH, 24],
    ['identificacaoPtrp', A, 17], // programa de tratamento de registro de ponto
    ['versaoLeiaute', A, 3]
  ],
  // Tipo 2 — identificacao do trabalhador
  2: [
    ['tipoRegistro', N, 1],
    ['cpf', N, 11],
    ['nome', A, 52],
    ['matricula', A, 20],
    ['admissao', A, 10],
    ['demissao', A, 10]
  ],
  // Tipo 3 — horario contratual do dia
  3: [
    ['tipoRegistro', N, 1],
    ['cpf', N, 11],
    ['data', A, 10],
    ['entradaPrevista', A, 5],
    ['saidaPrevista', A, 5],
    ['intervaloPrevistoMin', N, 4]
  ],
  // Tipo 4 — marcacao considerada na apuracao
  4: [
    ['tipoRegistro', N, 1],
    ['cpf', N, 11],
    ['dh', DH, 24],
    ['origem', A, 1],   // R = registro do REP-P, T = tratamento (inclusao)
    ['nsrOrigem', N, 9], // zeros quando a marcacao veio de tratamento
    ['motivo', A, 100]
  ],
  // Tipo 5 — totais apurados do dia
  5: [
    ['tipoRegistro', N, 1],
    ['cpf', N, 11],
    ['data', A, 10],
    ['trabalhadoMin', N, 5],
    ['extraMin', N, 5],
    ['faltaMin', N, 5],
    ['noturnoMin', N, 5],
    ['intervaloMin', N, 5]
  ],
  // Tipo 9 — trailer
  9: [
    ['tipoRegistro', N, 1],
    ['qtdTipo2', N, 9],
    ['qtdTipo3', N, 9],
    ['qtdTipo4', N, 9],
    ['qtdTipo5', N, 9]
  ]
};

export const VERSAO_LEIAUTE_AEJ = '003';

function montarLinhaAej(tipo, valores) {
  const campos = LEIAUTE_AEJ[tipo];
  if (!campos) throw new Error(`Tipo de registro desconhecido no AEJ: ${tipo}`);
  let linha = '';
  for (const [nome, tipoCampo, tamanho] of campos) {
    linha += formatarCampo(valores[nome], tipoCampo, tamanho);
  }
  return linha + crc16Hex(linha);
}

/**
 * Gera o AEJ do periodo para todos os trabalhadores sujeitos a controle de
 * jornada (os isentos pelo art. 62 da CLT ficam de fora).
 */
export function gerarAej({ de, ate, trabalhadores = null }) {
  const empregador = empregadorAtual();
  if (!empregador) throw new Error('Empregador nao cadastrado.');

  const lista = (trabalhadores || listarTrabalhadores({ incluirInativos: true }))
    .filter((t) => !t.isento_jornada);

  const fusoCompacto = config.fuso.replace(':', '');
  const linhas = [];
  const contagem = { 2: 0, 3: 0, 4: 0, 5: 0 };

  linhas.push(montarLinhaAej(1, {
    tipoRegistro: 1,
    tipoIdentificadorEmpregador: empregador.tipo_identificador,
    identificadorEmpregador: empregador.documento,
    cnoCaepf: empregador.cno_caepf,
    razaoSocial: empregador.razao_social,
    dhInicial: `${de}T00:00:00${fusoCompacto}`,
    dhFinal: `${ate}T23:59:59${fusoCompacto}`,
    dhGeracao: paraDH(new Date()),
    identificacaoPtrp: config.rep.identificacao,
    versaoLeiaute: VERSAO_LEIAUTE_AEJ
  }));

  for (const trabalhador of lista) {
    linhas.push(montarLinhaAej(2, {
      tipoRegistro: 2,
      cpf: trabalhador.cpf,
      nome: trabalhador.nome,
      matricula: trabalhador.matricula,
      admissao: trabalhador.admissao || '',
      demissao: trabalhador.demissao || ''
    }));
    contagem[2] += 1;

    const espelho = espelhoDePonto(trabalhador.id, { de, ate });
    for (const dia of espelho.dias) {
      const escala = escalaDoDia(trabalhador.id, dia.data);
      if (escala) {
        linhas.push(montarLinhaAej(3, {
          tipoRegistro: 3,
          cpf: trabalhador.cpf,
          data: dia.data,
          entradaPrevista: escala.entrada || '',
          saidaPrevista: escala.saida || '',
          intervaloPrevistoMin: escala.intervalo_min || 0
        }));
        contagem[3] += 1;
      }

      for (const marcacao of dia.marcacoes) {
        linhas.push(montarLinhaAej(4, {
          tipoRegistro: 4,
          cpf: trabalhador.cpf,
          dh: marcacao.dh,
          origem: marcacao.origem === 'tratamento' ? 'T' : 'R',
          nsrOrigem: marcacao.nsr || 0,
          motivo: marcacao.motivo || ''
        }));
        contagem[4] += 1;
      }

      // So gera totais para dias com movimento ou com escala prevista.
      if (dia.marcacoes.length > 0 || dia.previstoMin > 0) {
        linhas.push(montarLinhaAej(5, {
          tipoRegistro: 5,
          cpf: trabalhador.cpf,
          data: dia.data,
          trabalhadoMin: dia.trabalhadoMin,
          extraMin: dia.extraMin,
          faltaMin: dia.faltaMin,
          noturnoMin: dia.noturnoMin,
          intervaloMin: dia.intervaloMin
        }));
        contagem[5] += 1;
      }
    }
  }

  linhas.push(montarLinhaAej(9, {
    tipoRegistro: 9,
    qtdTipo2: contagem[2],
    qtdTipo3: contagem[3],
    qtdTipo4: contagem[4],
    qtdTipo5: contagem[5]
  }));

  const conteudo = linhas.join(CRLF) + CRLF;
  return {
    conteudo,
    linhas: linhas.length,
    contagem,
    sha256: crypto.createHash('sha256').update(conteudo, 'latin1').digest('hex')
  };
}

export function nomeArquivoAej(de, ate) {
  return `AEJ_${normalizarTexto(config.rep.identificacao).trim()}_${de.replace(/-/g, '')}_${ate.replace(/-/g, '')}.txt`;
}
