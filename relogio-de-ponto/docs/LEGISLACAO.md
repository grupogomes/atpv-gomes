# Análise legal — controle de jornada no Brasil

Levantamento das normas que incidem sobre um relógio de ponto empresarial, e
como cada uma aparece (ou não) neste sistema. Referências de artigos e súmulas
conferem com a legislação vigente; **o leiaute exato dos arquivos fiscais deve
ser conferido contra o Anexo I da Portaria antes do uso oficial** — ver
`HOMOLOGACAO.md`.

Isto é documentação técnica, não parecer jurídico. Antes de colocar em produção,
passe pelo seu advogado trabalhista e pelo sindicato da categoria.

---

## 1. A obrigação de registrar — CLT, art. 74

**Art. 74, §2º** (redação da Lei 13.874/2019): é obrigatória a anotação da hora
de entrada e de saída nos estabelecimentos com **mais de 20 trabalhadores**, em
registro manual, mecânico ou eletrônico.

**Art. 74, §4º**: fica permitido o registro por meio eletrônico, na forma
regulamentada pelo Poder Executivo — é o gancho da Portaria MTP 671/2021.

Abaixo de 20 empregados o registro não é obrigatório. Mas atenção: **se a
empresa registra, os registros valem contra ela.** Não existe meia adoção. Se
você vai controlar, controle direito.

> **Súmula 338 do TST, I** — a não apresentação injustificada dos controles de
> frequência gera **presunção relativa de veracidade da jornada alegada pelo
> trabalhador**, que pode ser elidida por prova em contrário.
>
> Este é o motivo comercial mais forte para ter o sistema em ordem: sem
> controle íntegro, na reclamatória vale o horário que o reclamante disser.

**Súmula 338, III**: cartões de ponto com horários **britânicos** (sempre
exatamente 08:00 e 18:00, todos os dias) são inválidos como prova e invertem o
ônus. Um sistema que registra o instante real, ao segundo, resolve isso
sozinho — e é justamente por isso que aqui **nada é arredondado no registro**.

---

## 2. Portaria MTP nº 671, de 8 de novembro de 2021

Consolidou e substituiu as Portarias 1.510/2009 e 373/2011. Vigente desde
10/02/2022. É a norma central deste projeto.

### 2.1 As três modalidades

| Sigla | O que é | Exige acordo coletivo? |
|---|---|---|
| **REP-C** | Registrador convencional: o relógio de parede com impressora | não |
| **REP-A** | Sistema alternativo, definido pela empresa | **sim** — convenção ou acordo coletivo |
| **REP-P** | Programa de registro de ponto, em servidor próprio ou nuvem | não |

Este sistema é um **REP-P**. Verifique mesmo assim se a convenção coletiva da
sua categoria traz cláusula própria sobre controle de jornada: norma coletiva
mais restritiva prevalece.

### 2.2 O que o REP-P precisa fazer

Implementado aqui:

- **Registrar a marcação e emitir comprovante** ao trabalhador a cada batida,
  por meio eletrônico, **independentemente de solicitação ou autorização do
  empregador** → `/kiosk/` mostra na hora, `/portal/` guarda todos, ambos com o
  hash de autenticidade.
- **Não permitir alteração ou exclusão** dos dados registrados → livro-razão
  append-only, cadeia de hash e gatilhos `RAISE(ABORT)` no SQLite.
- **Não restringir a marcação**: nada de bloquear horário, exigir intervalo
  mínimo, impedir marcação fora da escala → o único descarte é o duplo toque
  acidental dentro de segundos, e ele devolve o **mesmo** comprovante, não um
  novo registro.
- **Não fazer marcação automática** → não existe rota, agendador ou botão que
  crie marcação sem digital presente.
- **Gerar o AFD** — Arquivo-Fonte de Dados, a cópia crua e ordenada por NSR de
  tudo que foi registrado.
- **Gerar o AEJ** — Arquivo Eletrônico de Jornada, com o que a empresa apurou a
  partir do AFD, incluindo os tratamentos identificados.
- **NSR** — Número Sequencial de Registro, monotônico e nunca reutilizado.
- **Assinatura digital** dos arquivos e comprovantes com certificado
  ICP-Brasil → ponte pronta em `src/fiscal/assinatura.js`; **o certificado é
  providência do empregador**.

Pendências fora do software:

- **Registro do programa no INPI** e **ATTR** (Atestado Técnico e Termo de
  Responsabilidade) do desenvolvedor.

### 2.3 AFD e AEJ — por que são dois arquivos

Não são redundantes, e confundi-los é o erro mais comum:

- **AFD** = o que o registrador viu. Cru, imutável, sem interpretação. Se o
  trabalhador bateu quatro vezes num domingo às 3h da manhã, está lá.
- **AEJ** = o que a empresa apurou. Aqui entram escala contratual, marcações
  desconsideradas com motivo, inclusões manuais autorizadas, totais do dia.

Um jamais substitui o outro. Sistema que "corrige" a marcação no AFD está
fraudando — e é exatamente o que a arquitetura deste projeto torna impossível
pelo desenho, não pela boa vontade do operador.

---

## 3. Duração da jornada — o que o cálculo aplica

Implementado em `src/servicos/jornada.js`, com os parâmetros reunidos em
`PARAMETROS_CLT`. Convenção coletiva mais benéfica prevalece: ajuste ali.

### 3.1 Jornada padrão
**CF, art. 7º, XIII**: 8h diárias e 44h semanais, salvo compensação ou redução
por acordo/convenção.

### 3.2 Tolerância — CLT, art. 58, §1º
Variações de até **5 minutos por marcação**, limitadas a **10 minutos por dia**,
não são computadas como jornada extraordinária nem como atraso.

> **Súmula 366 do TST**: ultrapassado o limite, **conta-se a totalidade** do
> tempo excedente, não apenas o que passou de 10 minutos. O sistema aplica
> assim — testado em `teste/jornada.test.js`.

> **Súmula 449 do TST**: norma coletiva **não pode** ampliar essa tolerância.
> Não aumente `toleranciaDiariaMin` além de 10 achando que acordo coletivo
> resolve.

### 3.3 Horas extras — CLT, art. 59 e CF, art. 7º, XVI
Máximo de **2 horas extras por dia**; adicional mínimo de **50%**. O sistema
não bloqueia a marcação (não pode), mas sinaliza o excesso como ocorrência no
espelho, para o gestor agir.

**Art. 59, §2º** (banco de horas) e **art. 59-A** (12x36): dependem de acordo
individual escrito, acordo ou convenção coletiva, conforme o caso. O banco de
horas não está implementado — se a empresa usa, configure a escala e trate a
compensação no fechamento.

### 3.4 Intervalo intrajornada — CLT, art. 71
- jornada acima de 6h: mínimo **1 hora**;
- jornada entre 4h e 6h: mínimo **15 minutos**.

**§4º** (redação da Lei 13.467/2017): a não concessão, total ou parcial, gera o
pagamento **apenas do período suprimido**, com acréscimo de 50%, de natureza
**indenizatória**. O sistema aponta a ocorrência; o pagamento é da folha.

### 3.5 Intervalo interjornada — CLT, art. 66
Mínimo de **11 horas consecutivas** entre duas jornadas. Verificado dia a dia
no espelho.

### 3.6 Trabalho noturno — CLT, art. 73
- urbano: das **22h às 5h**;
- hora noturna reduzida: **52 minutos e 30 segundos**;
- adicional mínimo de **20%**.

O sistema soma os minutos de relógio dentro da faixa e converte pela hora
reduzida. Rural tem faixas diferentes (Lei 5.889/1973) — não implementado.

### 3.7 Descanso semanal — CLT, art. 67 e Lei 605/1949
**24 horas consecutivas**, preferencialmente aos domingos. Não há bloqueio: o
DSR aparece como dia sem escala prevista no espelho.

### 3.8 Quem não é sujeito a controle — CLT, art. 62
Isentos: atividade externa incompatível com fixação de horário (inciso I, com
a condição anotada na CTPS), gerentes com poderes de gestão (inciso II) e
teletrabalho **por produção ou tarefa** (inciso III).

Atenção à Lei 14.442/2022: **teletrabalho por jornada continua sujeito a
controle**. Marcar alguém como isento sem enquadramento real é passivo
trabalhista puro — o campo `isento_jornada` existe, mas use com parecer.

### 3.9 Aprendiz e menor
Jornada especial e vedação de prorrogação (CLT, arts. 411 a 414 e 432). Não há
regra automática: configure a escala e acompanhe as ocorrências.

---

## 3.10 Atestados — ausências justificadas

Implementado em `src/servicos/atestados.js`, com o catálogo de fundamentos em
`src/dominio/naturezas.js`. O sistema trata dois formatos:

- **atestado de dias** — um ou mais dias inteiros;
- **atestado de horas** — saída parcial, consulta, exame.

### Justificar não é o mesmo que abonar

Esta é a distinção que a prática mais confunde, e o sistema a trata como duas
grandezas separadas:

| | O que significa |
|---|---|
| **justifica** | a ausência deixa de ser falta injustificada: não gera punição e não faz perder o descanso semanal remunerado |
| **abona** | além disso, **não desconta do salário** |

**Atestado médico** — que atesta *incapacidade* para o trabalho — abona: o
desconto é vedado. **Declaração de comparecimento** — que só prova que a pessoa
*esteve* na clínica — justifica, mas **não obriga o abono**. O TRT-3 e o TRT-4
já decidiram nesse sentido: declaração de comparecimento não se confunde com
atestado médico. O empregador pode descontar as horas.

Há três situações em que o abono passa a ser devido mesmo assim:

1. **a hipótese está no art. 473 da CLT**, que diz expressamente "sem prejuízo
   do salário" — doação de sangue, acompanhar filho de até 6 anos em consulta,
   acompanhar consulta da esposa gestante, alistamento eleitoral. Se o direito é
   de um dia e a pessoa gastou três horas, abonar as três horas está *dentro* do
   direito;
2. **convenção ou acordo coletivo** prevê o abono;
3. **é prática habitual da empresa** — nesse caso incorporou ao contrato (CLT
   art. 468; Súmula 51 do TST) e não pode ser suprimido de quem já tinha.

Um detalhe que decide muitos casos: se o documento atesta **incapacidade por
parte do dia** ("afastado por 4 horas"), é atestado médico com efeito parcial e
abona. Não é "compareceu", é "esteve incapacitado".

O efeito padrão de cada natureza vem da lei (`src/dominio/naturezas.js`). O RH
pode sobrepor caso a caso, mas **só com motivo escrito** — é ali que mora a
diferença entre cumprir a norma e improvisar. Quem tem abono de consulta
previsto em CCT pode ligar `ABONA_CONSULTA=true` no `.env` e passar a abonar
por padrão.

### A regra que atravessa o módulo

Um atestado aceito cobre **exatamente o que faltou** para fechar a jornada
prevista, e nunca mais que isso. Se a pessoa cumpriu o dia inteiro e ainda
apresenta um atestado de 2h, a cobertura é zero — atestado não vira hora extra
nem crédito de banco de horas.

Atestado **pendente não abona nada**: entra na contagem e no alerta, fica de
fora dos dias abonados. Atestado **recusado** continua no histórico, com o
motivo — nada some.

### Fundamentos por natureza

| Natureza | Fundamento | Efeito | Limite |
|---|---|---|---|
| Doença do trabalhador | Lei 605/1949, art. 6º, §1º e §2º; Súmula 15 do TST | **abona** | do 16º dia consecutivo em diante o benefício é do INSS (Lei 8.213/1991, art. 60, §3º) |
| Acidente de trabalho / doença ocupacional | Lei 8.213/1991, arts. 19 a 21; CLT art. 118 | **abona** | 15 dias pela empresa; estabilidade de 12 meses após a alta; exige **CAT** |
| Acompanhamento de consulta da gestante | CLT art. 473, X | **abona** | até 2 dias |
| Acompanhamento de filho em consulta | CLT art. 473, XI | **abona** | 1 dia por ano, filho de até 6 anos |
| Doação de sangue | CLT art. 473, IV | **abona** | 1 dia a cada 12 meses |
| Consulta / exame do trabalhador | declaração de comparecimento | **justifica, sem abonar** | sem previsão legal de abono — **veja a convenção coletiva** |

O painel exibe o fundamento de cada natureza presente no período, para o RH não
precisar procurar em outro lugar na hora de decidir.

### Ordem preferencial dos atestados

A Lei 605/1949, art. 6º, §2º, e a **Súmula 15 do TST** estabelecem ordem
preferencial de quem emite o atestado (Previdência Social, SESI/SESC, sindicato,
serviço médico da empresa ou convênio e, por último, médico particular). O
sistema registra o emitente e o conselho profissional; a validação da ordem é
decisão humana, feita ao aceitar ou recusar.

### DSR

Doença comprovada por atestado **não faz perder o descanso semanal remunerado**
(Lei 605/1949, art. 6º). O abono do sistema já evita que o dia vire falta.

### O CID é opcional

Informar o diagnóstico é faculdade do trabalhador — o sigilo médico não obriga a
revelá-lo, e a empresa não pode condicionar o aceite do atestado a isso. Quando
informado, o CID é dado de saúde e portanto **dado pessoal sensível** (LGPD, art.
5º, II): fica cifrado no banco, nunca aparece nas listagens, e **cada leitura vai
para a auditoria**, com nome de quem consultou.

---

## 4. Guarda dos registros

- **CF, art. 7º, XXIX**: prescrição de **5 anos** no curso do contrato, até 2
  anos após a extinção. Os controles de jornada devem ser guardados por, no
  mínimo, **5 anos**.
- Guarde o **AFD assinado** de cada período, não só o banco de dados. O
  histórico de exportações fica registrado em `exportacao`, com SHA-256 de cada
  arquivo emitido.
- O template biométrico segue prazo diferente e muito mais curto — ver
  `LGPD.md`.

---

## 5. Biometria e proteção de dados

Tratado em detalhe em [`LGPD.md`](LGPD.md). Em resumo:

- biometria é **dado pessoal sensível** (Lei 13.709/2018, art. 5º, II);
- o tratamento apoia-se em consentimento específico e destacado (art. 11, I)
  somado ao cumprimento de obrigação legal do art. 74 da CLT (art. 11, II, "a");
- **é obrigatório oferecer alternativa** a quem recusar a biometria, sem
  prejuízo — por isso a credencial alternativa existe no sistema;
- guarde **template**, nunca imagem da digital; cifrado, e apagado de fato
  quando o titular pedir.

---

## 6. Pontos de atenção que dependem da sua empresa

1. **Convenção coletiva da categoria** — pode trazer cláusula sobre controle de
   jornada, tolerância, banco de horas ou uso de biometria. Ela prevalece
   quando mais benéfica.
2. **Comunicação prévia aos trabalhadores** sobre a adoção do sistema e sobre o
   tratamento do dado biométrico, por escrito.
3. **eSocial** — os eventos de folha (S-1200 e correlatos) consomem o resultado
   da apuração. A integração não está implementada; o AEJ e o espelho fornecem
   os totais.
4. **CIPA / segurança** — jornada excessiva recorrente é indicador de risco;
   as ocorrências do espelho servem de insumo.
5. **Empregado doméstico** tem regime próprio (LC 150/2015) e não é o caso
   deste sistema.

---

## Fontes consultadas

- [Portaria MTP nº 671/2021 — texto oficial (gov.br)](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/legislacao/portarias-1/portarias-vigentes-3/FolhadeRostoPortarian671de1denovembrode202105.10.2023.pdf)
- [Perguntas e Respostas sobre REP — Ministério do Trabalho e Emprego](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/fiscalizacao-do-trabalho/Perguntas%20e%20Respostas%20REP)
- [Leiaute do Arquivo-Fonte de Dados (AFD) — gov.br](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/fiscalizacao-do-trabalho/leiaute-do-arquivo-fonte-de-dados-afd.pdf)
- [Portaria 671 — Espaço Legislação TOTVS](https://espacolegislacao.totvs.com/portaria-671/)
- [Guia REP-C, REP-A e REP-P — UsePonto](https://useponto.com.br/blog/guia-pratico-portaria-671-2021)
- [O que mudou no controle de ponto eletrônico — Dimep](https://www.dimep.com.br/blog/post/portaria-671-o-que-mudou-no-controle-de-ponto-eletronico/)
- [Comprovante de ponto no novo modelo — Pontotel](https://www.pontotel.com.br/comprovante-de-ponto/)
