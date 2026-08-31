/**
 * Naturezas de atestado aceitas, com o respectivo fundamento legal.
 *
 * ===========================================================================
 * JUSTIFICAR NAO E O MESMO QUE ABONAR
 * ===========================================================================
 * Duas coisas diferentes, que a pratica costuma confundir:
 *
 *   justifica — a ausencia deixa de ser falta injustificada: nao gera punicao
 *               e nao faz perder o descanso semanal remunerado.
 *   abona     — alem de justificar, NAO desconta do salario.
 *
 * ATESTADO MEDICO (que atesta incapacidade para o trabalho) abona: o
 * empregador nao pode descontar. DECLARACAO DE COMPARECIMENTO (que so prova
 * que a pessoa esteve na clinica) justifica, mas NAO obriga o abono — e
 * jurisprudencia assentada no TRT-3 e no TRT-4. O empregador pode descontar as
 * horas, salvo em tres situacoes:
 *
 *   1. a hipotese esta no art. 473 da CLT, que diz "sem prejuizo do salario";
 *   2. convencao ou acordo coletivo preve o abono;
 *   3. o abono ja e pratica habitual da empresa — nesse caso incorporou ao
 *      contrato (CLT art. 468; Sumula 51 do TST) e nao pode ser suprimido de
 *      quem ja tinha.
 *
 * Por isso `efeitoPadrao` abaixo vem da lei, e o RH pode sobrepor caso a caso
 * (registrando o motivo) quando a convencao coletiva da categoria for mais
 * generosa que o piso legal.
 */
export const NATUREZAS = {
  doenca_propria: {
    rotulo: 'Doença do próprio trabalhador',
    fundamento: 'Lei 605/1949, art. 6º, §1º e §2º; Súmula 15 do TST',
    // Atestado medico de incapacidade: nao pode descontar.
    efeitoPadrao: 'abona',
    fundamentoEfeito: 'Atestado médico de incapacidade — o desconto é vedado.',
    // Do 16º dia de afastamento em diante quem paga e o INSS.
    limiteEmpresaDias: 15,
    observacao: 'A partir do 16º dia consecutivo o benefício passa ao INSS ' +
                '(Lei 8.213/1991, art. 60, §3º).'
  },
  acidente_trabalho: {
    rotulo: 'Acidente de trabalho ou doença ocupacional',
    fundamento: 'Lei 8.213/1991, arts. 19 a 21; CLT art. 118 (estabilidade de 12 meses)',
    efeitoPadrao: 'abona',
    fundamentoEfeito: 'Afastamento por acidente do trabalho — o desconto é vedado.',
    limiteEmpresaDias: 15,
    observacao: 'Exige emissão de CAT (Comunicação de Acidente de Trabalho) em ' +
                'até 1 dia útil, ou imediatamente em caso de óbito.'
  },
  acompanhamento_filho: {
    rotulo: 'Acompanhamento de filho em consulta',
    fundamento: 'CLT art. 473, XI',
    // O art. 473 diz "sem prejuizo do salario": abono obrigatorio.
    efeitoPadrao: 'abona',
    fundamentoEfeito: 'Ausência permitida "sem prejuízo do salário": o abono é obrigatório.',
    limiteAnualDias: 1,
    observacao: 'Um dia por ano, para filho de até 6 anos.'
  },
  acompanhamento_gestacao: {
    rotulo: 'Acompanhamento de consulta/exame da gestante',
    fundamento: 'CLT art. 473, X',
    efeitoPadrao: 'abona',
    fundamentoEfeito: 'Ausência permitida "sem prejuízo do salário": o abono é obrigatório.',
    limiteAnualDias: 2,
    observacao: 'Até dois dias, para acompanhar esposa ou companheira gestante.'
  },
  consulta: {
    rotulo: 'Consulta ou exame do próprio trabalhador',
    fundamento: 'Declaração de comparecimento — sem previsão legal de abono ' +
                '(TRT-3 e TRT-4: não se confunde com atestado médico)',
    // Piso legal: justifica a ausencia, mas nao obriga o abono. Se a convencao
    // coletiva da categoria previr o abono, marque ABONA_CONSULTA=true no .env
    // ou sobreponha o efeito no lancamento, registrando a clausula.
    efeitoPadrao: 'justifica',
    fundamentoEfeito: 'Declaração de comparecimento justifica a ausência, mas não ' +
                      'obriga o abono. O abono passa a ser devido se houver ' +
                      'previsão em convenção coletiva, em regulamento interno, ou ' +
                      'se já for prática habitual da empresa (CLT art. 468; ' +
                      'Súmula 51 do TST).',
    observacao: 'Se o documento atestar INCAPACIDADE por parte do dia (e não ' +
                'apenas comparecimento), trate como doença do próprio ' +
                'trabalhador: aí o abono é devido.'
  },
  doacao_sangue: {
    rotulo: 'Doação de sangue',
    fundamento: 'CLT art. 473, IV',
    efeitoPadrao: 'abona',
    fundamentoEfeito: 'Ausência permitida "sem prejuízo do salário": o abono é obrigatório.',
    limiteAnualDias: 1,
    observacao: 'Um dia a cada doze meses de trabalho.'
  },
  outro: {
    rotulo: 'Outro motivo legal',
    fundamento: 'CLT art. 473 e demais previsões legais ou de convenção coletiva',
    // Padrao conservador: quem lanca decide, e a decisao fica registrada.
    efeitoPadrao: 'justifica',
    fundamentoEfeito: 'Sem enquadramento automático: confira o fundamento e ' +
                      'marque o efeito manualmente.',
    observacao: ''
  }
};

export const CHAVES_NATUREZA = Object.keys(NATUREZAS);

/** Rótulo legível de uma natureza. */
export function rotuloNatureza(chave) {
  return NATUREZAS[chave]?.rotulo || chave;
}

export const EFEITOS = {
  abona: {
    rotulo: 'Abona',
    descricao: 'Justifica a ausência e não desconta do salário.'
  },
  justifica: {
    rotulo: 'Justifica',
    descricao: 'Justifica a ausência (não é falta injustificada, não perde o DSR), ' +
               'mas as horas são descontadas ou compensadas.'
  }
};

/** Efeito legal padrão de uma natureza. */
export function efeitoPadrao(chave) {
  return NATUREZAS[chave]?.efeitoPadrao || 'justifica';
}
