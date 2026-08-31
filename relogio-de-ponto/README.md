# Relógio de ponto — REP-P com biometria

Sistema de registro eletrônico de ponto para uso **dentro da empresa**, com
identificação por digital, construído em cima das exigências do art. 74 da CLT
e da **Portaria MTP nº 671/2021** (modalidade REP-P — Registrador Eletrônico de
Ponto via Programa).

Duas decisões de projeto explicam quase tudo o que está aqui:

1. **A marcação é imutável.** Registros entram num livro-razão encadeado por
   hash SHA-256, com gatilhos no próprio banco que recusam `UPDATE` e `DELETE`.
   Correção de jornada existe, mas entra ao lado do registro original, nunca no
   lugar dele. É o que a Portaria exige e é o que protege a empresa numa
   reclamatória.
2. **Ponto só se bate no lugar certo, pela pessoa certa.** Três barreiras
   cumulativas: rede da empresa, terminal provisionado com token secreto e
   digital do próprio trabalhador. Não existe caminho que pule qualquer uma
   delas — nem pelo celular, nem de casa, nem com o crachá do colega.

---

## Como isso impede que um bata o ponto pelo outro

| Barreira | O que é | O que ela sozinha impede |
|---|---|---|
| Rede autorizada | faixas CIDR configuradas em `REDES_AUTORIZADAS`, verificadas no servidor pelo IP real do socket (`X-Forwarded-For` é ignorado de propósito) | marcar de casa, do ônibus, da obra |
| Posto provisionado | cada computador recebe um `id` + token secreto, guardado só naquela máquina; o token é conferido com scrypt em tempo constante | marcar do celular pessoal, mesmo estando no Wi-Fi da empresa |
| Biometria 1:N | a digital identifica quem é; o sistema **não pergunta** matrícula nem CPF | um funcionário bater por outro |

O que a pessoa "tem de próprio" é o dedo dela — não um cartão, não uma senha,
não um QR code, que são justamente as coisas que se emprestam. As exceções
(dedo machucado, curativo) passam pela credencial alternativa, que exige
supervisor autenticado **no momento**, justificativa escrita, e grava um evento
sensível dentro do próprio AFD. É deliberadamente incômoda: é exceção, não
atalho.

---

## Começando

**No Windows** — clique duas vezes em **`INSTALAR.bat`**. Ele cuida de tudo:
instala o Node se faltar, baixa os componentes, pergunta os dados da empresa,
cria o banco e o seu acesso. Depois, para usar no dia a dia, clique em
**`INICIAR.bat`**.

**Linux ou macOS**, ou se preferir a linha de comando:

```bash
npm install
cp .env.exemplo .env      # preencha CNPJ, razão social e as chaves
npm run migrar            # cria o banco e registra o empregador
npm run seed              # cria o administrador e o primeiro posto
npm start                 # sobe em http://0.0.0.0:3000
```

Gere a chave de cifragem da biometria e o segredo de sessão com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Três telas:

| Endereço | Para quem | O que faz |
|---|---|---|
| `/kiosk/` | trabalhador, no terminal da empresa | bate o ponto e mostra o comprovante |
| `/admin/` | RH e gestores | cadastro, biometria, **atestados**, espelho, AFD/AEJ, auditoria |
| `/portal/` | trabalhador | consulta os próprios registros e confere comprovantes |

### Provisionar um terminal

```bash
npm run posto -- RECEPCAO-01 "Recepção — terminal 1"
```

O token aparece **uma única vez**. Abra `/kiosk/` naquele computador e cole id e
token; ficam guardados no `localStorage` daquela máquina. Perdeu o token?
Reemita — o antigo deixa de valer na hora.

---

## Estrutura

```
src/
  config.js              configuração (.env)
  db/schema.sql          esquema; gatilhos de imutabilidade
  dominio/
    livro.js             livro-razão append-only + cadeia de hash + NSR
    naturezas.js         naturezas de atestado e seu fundamento legal
    crc16.js             CRC-16/KERMIT do leiaute fiscal
    datas.js cpf.js      formatos do Anexo I
    termo.js             termo de consentimento LGPD, versionado
  servicos/
    marcacao.js          registro da marcação (o coração do sistema)
    jornada.js           apuração: tolerância, intervalo, noturno, extras
    atestados.js         atestados de dias e de horas + painel de ausências
    biometria.js         templates cifrados em AES-256-GCM
    postos.js            terminais autorizados
    trabalhadores.js empregador.js usuarios.js auditoria.js
  fiscal/
    leiaute.js           LEIAUTE DO AFD — todo o formato mora aqui
    afd.js aej.js        geração e conferência dos arquivos fiscais
    comprovante.js       comprovante em texto (bobina) e PDF
    assinatura.js        ponte para assinatura ICP-Brasil
  biometria/
    driver.js            contrato do leitor
    agente.js            cliente do agente local (SDK do fabricante)
    simulador.js         driver de homologação
  seguranca/
    rede.js cripto.js
  http/                  servidor, rotas e as barreiras de acesso
public/kiosk|admin|portal
agente-biometrico/       como plugar o seu leitor
teste/                   55 testes (`npm run teste`)
docs/
  LEGISLACAO.md          a análise legal completa
  LGPD.md                biometria como dado sensível
  INSTALACAO.md          instalar no computador da empresa
  INSTALACAO-WINDOWS.md  roteiro do Windows, com instalador PowerShell
  HOMOLOGACAO.md         o que ainda falta antes do uso oficial
```

---

## Leia antes de usar oficialmente

Este repositório entrega o **software**. Três providências não são de software
e continuam pendentes, sem as quais o sistema não está regular perante a
fiscalização:

1. **Registro do programa no INPI** e emissão do **ATTR** (Atestado Técnico e
   Termo de Responsabilidade), assinado pelo responsável técnico e pelo
   representante legal do desenvolvedor.
2. **Certificado digital ICP-Brasil** do empregador, ligado ao sistema pelas
   variáveis `ASSINATURA_*`. Sem ele, AFD, AEJ e comprovantes saem sem
   assinatura — e o painel avisa isso em vermelho.
3. **Conferência do leiaute** de `src/fiscal/leiaute.js` e `src/fiscal/aej.js`
   contra o texto oficial do Anexo I da Portaria. Todo o formato está isolado
   nesses dois arquivos exatamente para que essa conferência seja pontual.

Detalhes em [`docs/HOMOLOGACAO.md`](docs/HOMOLOGACAO.md).

---

## Testes

```bash
npm run teste
```

Cobrem, entre outros: a cadeia de hash e a detecção de adulteração no banco, a
recusa de marcação remota, o CRC-16 contra vetor de referência, os tamanhos de
todas as linhas do AFD, a tolerância do art. 58 §1º, o intervalo do art. 71, a
hora noturna reduzida do art. 73, a preservação do registro original quando o
RH lança um ajuste, e o abono de atestados — incluindo a regra de que atestado
nunca vira hora extra, que pendente não abona nada, e que declaração de
comparecimento justifica sem abonar.

---

## Painel de atestados

O painel do RH tem uma aba de **atestados**, que trata dias inteiros e horas:

- indicadores do período: atestados, dias abonados, horas abonadas, pessoas;
- ranking por funcionário, em dias e em horas, e a evolução mês a mês;
- alerta automático quando um afastamento chega a 15 dias (a partir do 16º o
  benefício passa ao INSS — Lei 8.213/1991, art. 60, §3º) e quando há atestado
  aguardando conferência;
- o fundamento legal de cada natureza fica visível na própria tela.

Duas regras centrais:

- **justificar não é abonar.** Atestado médico (incapacidade) abona — não pode
  descontar. Declaração de comparecimento (consulta de rotina) justifica a
  ausência, mas não obriga o abono, salvo nas hipóteses do art. 473 da CLT, em
  previsão de convenção coletiva, ou quando já for prática da empresa. O efeito
  padrão de cada natureza vem da lei; sobrepor exige motivo escrito.
- **um atestado aceito cobre exatamente o que faltou** para fechar a jornada
  prevista, nunca mais que isso. Atestado não vira hora extra. Pendente não
  abona; recusado fica no histórico com o motivo.

Detalhes em [`docs/LEGISLACAO.md`](docs/LEGISLACAO.md) § 3.10.
