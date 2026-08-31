/**
 * Naturezas de atestado aceitas, com o respectivo fundamento legal.
 *
 * A natureza importa por dois motivos praticos: define quem paga (empresa ou
 * INSS) e define se ha limite legal de dias por ano.
 */
export const NATUREZAS = {
  doenca_propria: {
    rotulo: 'Doença do próprio trabalhador',
    fundamento: 'Lei 605/1949, art. 6º, §1º e §2º; Súmula 15 do TST',
    // Do 16º dia de afastamento em diante quem paga e o INSS.
    limiteEmpresaDias: 15,
    observacao: 'A partir do 16º dia consecutivo o benefício passa ao INSS ' +
                '(Lei 8.213/1991, art. 60, §3º).'
  },
  acidente_trabalho: {
    rotulo: 'Acidente de trabalho ou doença ocupacional',
    fundamento: 'Lei 8.213/1991, arts. 19 a 21; CLT art. 118 (estabilidade de 12 meses)',
    limiteEmpresaDias: 15,
    observacao: 'Exige emissão de CAT (Comunicação de Acidente de Trabalho) em ' +
                'até 1 dia útil, ou imediatamente em caso de óbito.'
  },
  acompanhamento_filho: {
    rotulo: 'Acompanhamento de filho em consulta',
    fundamento: 'CLT art. 473, XI',
    limiteAnualDias: 1,
    observacao: 'Um dia por ano, para filho de até 6 anos.'
  },
  acompanhamento_gestacao: {
    rotulo: 'Acompanhamento de consulta/exame da gestante',
    fundamento: 'CLT art. 473, X',
    limiteAnualDias: 2,
    observacao: 'Até dois dias, para acompanhar esposa ou companheira gestante.'
  },
  consulta: {
    rotulo: 'Consulta ou exame do próprio trabalhador',
    fundamento: 'Atestado de comparecimento; abono usual e frequentemente previsto em CCT',
    observacao: 'Confira a convenção coletiva da categoria: o abono por horas ' +
                'costuma ser tratado ali.'
  },
  doacao_sangue: {
    rotulo: 'Doação de sangue',
    fundamento: 'CLT art. 473, IV',
    limiteAnualDias: 1,
    observacao: 'Um dia a cada doze meses de trabalho.'
  },
  outro: {
    rotulo: 'Outro motivo legal',
    fundamento: 'CLT art. 473 e demais previsões legais ou de convenção coletiva',
    observacao: ''
  }
};

export const CHAVES_NATUREZA = Object.keys(NATUREZAS);

/** Rótulo legível de uma natureza. */
export function rotuloNatureza(chave) {
  return NATUREZAS[chave]?.rotulo || chave;
}
