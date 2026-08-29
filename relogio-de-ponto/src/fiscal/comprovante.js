import PDFDocument from 'pdfkit';
import { config } from '../config.js';
import { empregadorAtual } from '../servicos/empregador.js';
import { formatarCpf } from '../dominio/cpf.js';
import { assinar, assinaturaConfigurada } from './assinatura.js';

/**
 * Comprovante de Registro de Ponto do Trabalhador.
 *
 * A Portaria MTP 671/2021 obriga o REP-P a disponibilizar o comprovante ao
 * trabalhador a cada marcacao, por meio eletronico, INDEPENDENTEMENTE de
 * pedido ou autorizacao do empregador. Por isso o quiosque mostra o
 * comprovante na hora e o portal do trabalhador guarda todos eles.
 *
 * O comprovante carrega o hash SHA-256 do registro: e com ele que o
 * trabalhador (ou um perito) confere, anos depois, que a marcacao guardada no
 * sistema e exatamente a que foi emitida naquele instante.
 */

/** Dados normalizados que aparecem no comprovante, em qualquer formato. */
export function dadosComprovante(marcacao) {
  const empregador = empregadorAtual();
  return {
    titulo: 'COMPROVANTE DE REGISTRO DE PONTO DO TRABALHADOR',
    empregadorNome: empregador?.razao_social || '',
    empregadorDocumento: empregador?.documento || '',
    empregadorTipoDocumento: empregador?.tipo_identificador === 2 ? 'CPF' : 'CNPJ',
    empregadorEndereco: empregador?.endereco || '',
    repIdentificacao: config.rep.identificacao,
    repTipo: 'REP-P (Portaria MTP nº 671/2021)',
    trabalhadorNome: marcacao.nome,
    trabalhadorCpf: formatarCpf(marcacao.cpf),
    nsr: String(marcacao.nsr).padStart(9, '0'),
    dataHora: marcacao.dh,
    dataLegivel: `${marcacao.dh.slice(8, 10)}/${marcacao.dh.slice(5, 7)}/${marcacao.dh.slice(0, 4)}`,
    horaLegivel: marcacao.dh.slice(11, 19),
    posto: marcacao.postoId,
    metodo: marcacao.metodo === 'biometria' ? 'Biometria (digital)' : 'Credencial alternativa',
    hash: marcacao.hash
  };
}

/**
 * Versao texto — para impressora termica de bobina (40 colunas).
 *
 * Sai deliberadamente SEM acentuacao: boa parte das impressoras termicas de
 * bobina imprime lixo no lugar de caractere acentuado. A versao em PDF e a
 * tela do quiosque mostram o texto acentuado normalmente.
 */
export function comprovanteTexto(marcacao) {
  const d = semAcento(dadosComprovante(marcacao));
  const linha = '-'.repeat(40);
  return [
    linha,
    'COMPROVANTE DE REGISTRO DE PONTO',
    'DO TRABALHADOR',
    linha,
    quebrar(d.empregadorNome, 40),
    `${d.empregadorTipoDocumento}: ${d.empregadorDocumento}`,
    quebrar(d.empregadorEndereco, 40),
    linha,
    `REP-P: ${d.repIdentificacao}`,
    `NSR..: ${d.nsr}`,
    linha,
    quebrar(d.trabalhadorNome, 40),
    `CPF..: ${d.trabalhadorCpf}`,
    `DATA.: ${d.dataLegivel}  HORA: ${d.horaLegivel}`,
    `POSTO: ${d.posto}`,
    `IDENT: ${d.metodo}`,
    linha,
    'Codigo de autenticidade (SHA-256):',
    d.hash.match(/.{1,40}/g).join('\n'),
    linha,
    'Guarde este comprovante.',
    'Confira em: /portal',
    linha,
    ''
  ].join('\n');
}

/** Remove acentuacao de todos os campos de texto do comprovante. */
function semAcento(dados) {
  const limpo = {};
  for (const [chave, valor] of Object.entries(dados)) {
    limpo[chave] = typeof valor === 'string'
      ? valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      : valor;
  }
  return limpo;
}

function quebrar(texto, largura) {
  const palavras = String(texto || '').split(/\s+/);
  const linhas = [];
  let atual = '';
  for (const palavra of palavras) {
    if ((atual + ' ' + palavra).trim().length > largura) {
      if (atual) linhas.push(atual.trim());
      atual = palavra;
    } else {
      atual = `${atual} ${palavra}`;
    }
  }
  if (atual.trim()) linhas.push(atual.trim());
  return linhas.join('\n');
}

/**
 * Versao PDF. Retorna um Buffer.
 * Se houver certificado ICP-Brasil configurado, o PDF sai assinado (PAdES);
 * caso contrario sai sem assinatura e o sistema avisa em /admin/saude.
 */
export async function comprovantePdf(marcacao) {
  const d = dadosComprovante(marcacao);
  const doc = new PDFDocument({ size: [226, 420], margins: { top: 16, left: 16, right: 16, bottom: 16 } });
  const pedacos = [];
  doc.on('data', (p) => pedacos.push(p));
  const pronto = new Promise((resolve) => doc.on('end', resolve));

  doc.fontSize(8).font('Helvetica-Bold');
  doc.text(d.titulo, { align: 'center' });
  doc.moveDown(0.5).font('Helvetica').fontSize(7);

  const secao = (linhas) => {
    for (const [rotulo, valor] of linhas) {
      if (valor === undefined || valor === null || valor === '') continue;
      doc.font('Helvetica-Bold').text(`${rotulo}: `, { continued: true });
      doc.font('Helvetica').text(String(valor));
    }
    doc.moveDown(0.4);
  };

  secao([
    ['Empregador', d.empregadorNome],
    [d.empregadorTipoDocumento, d.empregadorDocumento],
    ['Local', d.empregadorEndereco]
  ]);
  secao([
    ['Registrador', d.repTipo],
    ['Identificação do REP', d.repIdentificacao]
  ]);
  secao([
    ['Trabalhador', d.trabalhadorNome],
    ['CPF', d.trabalhadorCpf]
  ]);
  secao([
    ['NSR', d.nsr],
    ['Data', d.dataLegivel],
    ['Hora', d.horaLegivel],
    ['Posto', d.posto],
    ['Identificação', d.metodo]
  ]);

  doc.font('Helvetica-Bold').fontSize(6).text('Código de autenticidade (SHA-256)');
  doc.font('Courier').fontSize(6).text(d.hash, { width: 194 });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(5.5).text(
    'Documento emitido nos termos da Portaria MTP nº 671/2021. O registro que ' +
    'lhe deu origem é imutável e está encadeado por hash no arquivo-fonte de ' +
    'dados (AFD) do empregador.',
    { align: 'justify' }
  );

  doc.end();
  await pronto;
  const pdf = Buffer.concat(pedacos);
  return assinaturaConfigurada() ? assinar(pdf, { tipo: 'pdf' }) : pdf;
}
