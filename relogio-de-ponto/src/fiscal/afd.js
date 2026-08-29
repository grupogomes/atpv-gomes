import crypto from 'node:crypto';
import { LEIAUTE_AFD, VERSAO_LEIAUTE, formatarCampo } from './leiaute.js';
import { crc16Hex } from '../dominio/crc16.js';
import { listarRegistros } from '../dominio/livro.js';
import { paraDH } from '../dominio/datas.js';
import { config } from '../config.js';
import { empregadorAtual } from '../servicos/empregador.js';

const CRLF = '\r\n';

/**
 * Monta uma linha do AFD a partir do leiaute declarado e acrescenta o
 * verificador exigido para aquele tipo de registro.
 */
export function montarLinha(tipo, valores) {
  const definicao = LEIAUTE_AFD[tipo];
  if (!definicao) throw new Error(`Tipo de registro desconhecido no AFD: ${tipo}`);

  let linha = '';
  for (const [nome, tipoCampo, tamanho] of definicao.campos) {
    linha += formatarCampo(valores[nome], tipoCampo, tamanho);
  }

  if (definicao.verificador === 'crc16') {
    return linha + crc16Hex(linha);
  }
  // SHA-256 do proprio registro, em hexadecimal maiusculo (registros 6 e 7).
  return linha + crypto.createHash('sha256').update(linha, 'latin1').digest('hex').toUpperCase();
}

/**
 * Gera o Arquivo-Fonte de Dados de um periodo.
 *
 * O AFD e a fotografia fiel do livro-razao: ele nao interpreta, nao corrige e
 * nao omite nada. Qualquer ajuste de jornada aparece no AEJ, nunca aqui.
 *
 * @param {{inicio: Date, fim: Date}} periodo
 * @returns {{conteudo: string, linhas: number, nsrInicial: number|null, nsrFinal: number|null, sha256: string}}
 */
export function gerarAfd({ inicio, fim }) {
  const empregador = empregadorAtual();
  if (!empregador) {
    throw new Error('Empregador não cadastrado: configure o .env e rode `npm run migrar`.');
  }

  const dhInicial = paraDH(inicio);
  const dhFinal = paraDH(fim);
  const registros = listarRegistros({
    inicio: dhInicial, fim: dhFinal, tipos: ['2', '4', '5', '6', '7']
  });

  const linhas = [];
  const contagem = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };

  // Cabecalho (tipo 1). NSR do cabecalho e sempre zero.
  linhas.push(montarLinha(1, {
    nsr: 0,
    tipoRegistro: 1,
    tipoIdentificadorEmpregador: empregador.tipo_identificador,
    identificadorEmpregador: empregador.documento,
    cnoCaepf: empregador.cno_caepf,
    razaoSocial: empregador.razao_social,
    identificacaoRep: config.rep.identificacao,
    dhInicial,
    dhFinal,
    dhGeracao: paraDH(new Date()),
    versaoLeiaute: VERSAO_LEIAUTE,
    tipoRep: config.rep.tipo
  }));

  for (const registro of registros) {
    const c = registro.conteudo;
    contagem[registro.tipo] += 1;

    switch (registro.tipo) {
      case '2':
        linhas.push(montarLinha(2, {
          nsr: registro.nsr,
          tipoRegistro: 2,
          dh: registro.dh,
          tipoIdentificadorEmpregador: c.tipoIdentificador,
          identificadorEmpregador: c.documento,
          cnoCaepf: c.cnoCaepf,
          razaoSocial: c.razaoSocial,
          localPrestacaoServico: c.endereco
        }));
        break;

      case '4':
        linhas.push(montarLinha(4, {
          nsr: registro.nsr,
          tipoRegistro: 4,
          dhAnterior: c.dhAnterior,
          dhAjustada: c.dhAjustada
        }));
        break;

      case '5':
        linhas.push(montarLinha(5, {
          nsr: registro.nsr,
          tipoRegistro: 5,
          operacao: c.operacao,
          dh: registro.dh,
          cpf: c.cpf,
          nome: c.nome
        }));
        break;

      case '6':
        linhas.push(montarLinha(6, {
          nsr: registro.nsr,
          tipoRegistro: 6,
          tipoEvento: codigoEvento(c.evento),
          dh: registro.dh
        }));
        break;

      case '7':
        linhas.push(montarLinha(7, {
          nsr: registro.nsr,
          tipoRegistro: 7,
          dh: registro.dh,
          cpf: c.cpf,
          dhGravacao: registro.dhGravacao,
          coletor: c.postoId,
          offline: c.offline ? 1 : 0
        }));
        break;
    }
  }

  // Trailer (tipo 9).
  linhas.push(montarLinha(9, {
    nsr: '999999999',
    tipoRegistro: 9,
    qtdTipo2: contagem[2],
    qtdTipo3: contagem[3],
    qtdTipo4: contagem[4],
    qtdTipo5: contagem[5],
    qtdTipo6: contagem[6],
    qtdTipo7: contagem[7],
    qtdTipo8: contagem[8]
  }));

  const conteudo = linhas.join(CRLF) + CRLF;
  return {
    conteudo,
    linhas: linhas.length,
    contagem,
    nsrInicial: registros.length ? registros[0].nsr : null,
    nsrFinal: registros.length ? registros[registros.length - 1].nsr : null,
    sha256: crypto.createHash('sha256').update(conteudo, 'latin1').digest('hex')
  };
}

/** Codigos dos eventos sensiveis registrados por este REP-P. */
function codigoEvento(evento) {
  const mapa = {
    IDENTIFICACAO_ALTERNATIVA: '01',
    EXPORTACAO_AFD: '02',
    SINCRONIZACAO_OFFLINE: '03',
    FALHA_INTEGRIDADE: '04'
  };
  return mapa[evento] || '99';
}

/**
 * Le um AFD gerado por este ou por outro REP e confere os verificadores.
 * Serve para o RH auditar o proprio arquivo antes de entregar a fiscalizacao.
 */
export function conferirAfd(conteudo) {
  const problemas = [];
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.length > 0);

  linhas.forEach((linha, indice) => {
    const tipo = linha.length > 9 ? linha[9] : '?';
    const definicao = LEIAUTE_AFD[tipo];
    if (!definicao) {
      problemas.push({ linha: indice + 1, erro: `tipo de registro desconhecido: ${tipo}` });
      return;
    }
    const base = definicao.campos.reduce((s, [, , t]) => s + t, 0);
    const tamanhoVerificador = definicao.verificador === 'crc16' ? 4 : 64;
    if (linha.length !== base + tamanhoVerificador) {
      problemas.push({
        linha: indice + 1,
        erro: `tamanho ${linha.length}, esperado ${base + tamanhoVerificador} para o tipo ${tipo}`
      });
      return;
    }
    const corpo = linha.slice(0, base);
    const verificador = linha.slice(base);
    const esperado = definicao.verificador === 'crc16'
      ? crc16Hex(corpo)
      : crypto.createHash('sha256').update(corpo, 'latin1').digest('hex').toUpperCase();
    if (verificador !== esperado) {
      problemas.push({ linha: indice + 1, erro: `verificador nao confere (tipo ${tipo})` });
    }
  });

  return { linhas: linhas.length, valido: problemas.length === 0, problemas };
}

/** Nome de arquivo sugerido pela pratica de mercado: AFD + identificacao do REP. */
export function nomeArquivoAfd(inicio, fim) {
  const d = (data) => paraDH(data).slice(0, 10).replace(/-/g, '');
  return `AFD_${config.rep.identificacao.trim()}_${d(inicio)}_${d(fim)}.txt`;
}
