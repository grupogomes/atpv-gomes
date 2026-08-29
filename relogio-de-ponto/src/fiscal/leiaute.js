/**
 * ===========================================================================
 * LEIAUTE DO AFD — Anexo I da Portaria MTP nº 671/2021
 * ===========================================================================
 *
 * ATENCAO, LEIA ANTES DE HOMOLOGAR
 * --------------------------------
 * Todo o formato do arquivo fiscal esta declarado NESTE UNICO ARQUIVO. Nenhum
 * outro modulo conhece posicoes, tamanhos ou ordem de campos. Isso e
 * proposital: quando o leiaute for conferido contra o texto oficial do Anexo I
 * (ou for atualizado por nova portaria), a correcao acontece so aqui.
 *
 * Antes de emitir AFD para fiscalizacao, confira campo a campo contra o Anexo I
 * publicado pelo Ministerio do Trabalho e Emprego e rode `npm run teste`.
 * O sistema tambem exige, por norma, o registro do programa no INPI e o
 * Atestado Tecnico e Termo de Responsabilidade (ATTR) — ver docs/HOMOLOGACAO.md.
 *
 * Convencoes do Anexo I ja implementadas aqui:
 *  - arquivo texto, uma linha por registro, terminador CRLF;
 *  - campos numericos alinhados a direita e completados com zeros a esquerda;
 *  - campos alfanumericos alinhados a esquerda e completados com espacos;
 *  - registros ordenados por NSR;
 *  - data/hora no formato ISO 8601 com deslocamento: 2021-04-27T16:44:00-0300;
 *  - CRC-16/KERMIT nos registros 1 a 5 e 9;
 *  - SHA-256 nos registros 6 e 7 (gerados por REP-P).
 */

export const VERSAO_LEIAUTE = '003';

/** Tipos de campo aceitos pelo montador. */
const N = 'N'; // numerico, zeros a esquerda
const A = 'A'; // alfanumerico, espacos a direita
const DH = 'DH'; // data/hora ISO com deslocamento, 24 posicoes

/**
 * Definicao dos registros. Cada campo: [nome, tipo, tamanho].
 * O CRC-16 / hash e acrescentado pelo montador, no fim da linha.
 */
export const LEIAUTE_AFD = {
  // Registro tipo 1 — cabecalho do arquivo
  1: {
    verificador: 'crc16',
    campos: [
      ['nsr', N, 9],
      ['tipoRegistro', N, 1],
      ['tipoIdentificadorEmpregador', N, 1], // 1 = CNPJ, 2 = CPF
      ['identificadorEmpregador', N, 14],
      ['cnoCaepf', A, 12],
      ['razaoSocial', A, 150],
      ['identificacaoRep', A, 17],
      ['dhInicial', DH, 24],
      ['dhFinal', DH, 24],
      ['dhGeracao', DH, 24],
      ['versaoLeiaute', A, 3],
      ['tipoRep', N, 1] // 1 = REP-C, 2 = REP-A, 3 = REP-P
    ]
  },

  // Registro tipo 2 — inclusao ou alteracao de empregador
  2: {
    verificador: 'crc16',
    campos: [
      ['nsr', N, 9],
      ['tipoRegistro', N, 1],
      ['dh', DH, 24],
      ['tipoIdentificadorEmpregador', N, 1],
      ['identificadorEmpregador', N, 14],
      ['cnoCaepf', A, 12],
      ['razaoSocial', A, 150],
      ['localPrestacaoServico', A, 100]
    ]
  },

  // Registro tipo 3 — marcacao de ponto em REP-C / REP-A.
  // Um REP-P nao emite este tipo; fica declarado para leitura de AFD de terceiros.
  3: {
    verificador: 'crc16',
    campos: [
      ['nsr', N, 9],
      ['tipoRegistro', N, 1],
      ['dh', DH, 24],
      ['cpf', N, 11]
    ]
  },

  // Registro tipo 4 — ajuste do relogio
  4: {
    verificador: 'crc16',
    campos: [
      ['nsr', N, 9],
      ['tipoRegistro', N, 1],
      ['dhAnterior', DH, 24],
      ['dhAjustada', DH, 24]
    ]
  },

  // Registro tipo 5 — inclusao, alteracao ou exclusao de empregado
  5: {
    verificador: 'crc16',
    campos: [
      ['nsr', N, 9],
      ['tipoRegistro', N, 1],
      ['operacao', A, 1], // I = inclusao, A = alteracao, E = exclusao
      ['dh', DH, 24],
      ['cpf', N, 11],
      ['nome', A, 52]
    ]
  },

  // Registro tipo 6 — evento sensivel do REP
  6: {
    verificador: 'sha256',
    campos: [
      ['nsr', N, 9],
      ['tipoRegistro', N, 1],
      ['tipoEvento', A, 2],
      ['dh', DH, 24]
    ]
  },

  // Registro tipo 7 — marcacao de ponto em REP-P
  7: {
    verificador: 'sha256',
    campos: [
      ['nsr', N, 9],
      ['tipoRegistro', N, 1],
      ['dh', DH, 24],
      ['cpf', N, 11],
      ['dhGravacao', DH, 24],
      ['coletor', A, 17],
      ['offline', N, 1] // 1 = coletada offline e sincronizada depois
    ]
  },

  // Registro tipo 9 — trailer, com a contagem de registros por tipo
  9: {
    verificador: 'crc16',
    campos: [
      ['nsr', A, 9], // preenchido com '9' repetido
      ['tipoRegistro', N, 1],
      ['qtdTipo2', N, 9],
      ['qtdTipo3', N, 9],
      ['qtdTipo4', N, 9],
      ['qtdTipo5', N, 9],
      ['qtdTipo6', N, 9],
      ['qtdTipo7', N, 9],
      ['qtdTipo8', N, 9]
    ]
  }
};

/** Remove acentos e caracteres fora do conjunto aceito em campos alfanumericos. */
export function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ');
}

/** Formata um campo isolado conforme tipo e tamanho. */
export function formatarCampo(valor, tipo, tamanho) {
  if (tipo === N) {
    const digitos = String(valor ?? '').replace(/\D/g, '');
    if (digitos.length > tamanho) return digitos.slice(-tamanho);
    return digitos.padStart(tamanho, '0');
  }
  if (tipo === DH) {
    const texto = String(valor ?? '');
    if (texto && texto.length !== tamanho) {
      throw new Error(`Campo data/hora com tamanho invalido: "${texto}" (esperado ${tamanho})`);
    }
    return texto.padEnd(tamanho, ' ');
  }
  const texto = normalizarTexto(valor);
  return texto.slice(0, tamanho).padEnd(tamanho, ' ');
}

/** Tamanho da parte fixa de um registro, sem o verificador. */
export function tamanhoBase(tipo) {
  return LEIAUTE_AFD[tipo].campos.reduce((soma, [, , t]) => soma + t, 0);
}
