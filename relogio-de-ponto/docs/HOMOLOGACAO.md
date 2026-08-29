# O que falta antes do uso oficial

O software está pronto e testado. Três providências **não são de software** e
sem elas o sistema não está regular perante a fiscalização do trabalho. Estão
listadas aqui em ordem de importância.

---

## 1. Conferir o leiaute dos arquivos fiscais

**Por que existe esta pendência:** o texto oficial do Anexo I da Portaria MTP
671/2021 não pôde ser acessado no ambiente onde este código foi escrito (o
domínio gov.br estava bloqueado). O leiaute implementado segue a estrutura
descrita na norma e a prática de mercado — tipos de registro, ordem dos campos,
formato de data/hora ISO com deslocamento, CRC-16/KERMIT nos registros 1 a 5 e
9, SHA-256 nos registros 6 e 7 — mas **as posições e tamanhos exatos de cada
campo precisam ser conferidos** contra o texto publicado.

**Por que isso é barato de resolver:** todo o formato está isolado em dois
arquivos. Nenhum outro módulo do sistema conhece posição ou tamanho de campo.

| Arquivo | O que contém |
|---|---|
| `src/fiscal/leiaute.js` | leiaute completo do AFD, registro por registro |
| `src/fiscal/aej.js` (`LEIAUTE_AEJ`) | leiaute do AEJ |

**Como conferir:**

1. Baixe o Anexo I em
   <https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/fiscalizacao-do-trabalho/leiaute-do-arquivo-fonte-de-dados-afd.pdf>
2. Compare campo a campo com as tabelas `LEIAUTE_AFD` e `LEIAUTE_AEJ`.
3. Ajuste tamanhos, ordem ou nomes onde divergir.
4. Rode `npm run teste` — o teste "toda linha do AFD tem o tamanho declarado no
   leiaute" continua valendo, porque ele confere o arquivo gerado contra a
   própria declaração.
5. Gere um AFD real e valide com o **Programa Verificador** disponibilizado
   pelo Ministério do Trabalho e Emprego, ou com o validador do seu contador.

Sem esse passo, o AFD gerado é internamente consistente e verificável, mas pode
não ser lido pelo validador oficial.

---

## 2. Certificado digital ICP-Brasil

A Portaria exige que AFD, AEJ e comprovantes sejam assinados digitalmente com
certificado ICP-Brasil do empregador (**e-CNPJ** A1 ou A3).

O sistema já tem a ponte pronta em `src/fiscal/assinatura.js`. Configure:

```bash
ASSINATURA_COMANDO=/usr/local/bin/assinar-icp
ASSINATURA_CERTIFICADO=/opt/repp/certificado.p12
ASSINATURA_SENHA_ARQUIVO=/opt/repp/senha.txt   # permissão 600
```

O comando é chamado assim:

```
<comando> --tipo pdf|cades --entrada ARQ --saida ARQ \
          --certificado P12 [--senha-arquivo ARQ]
```

Qualquer ferramenta que atenda a essa interface serve. Enquanto não estiver
configurado, o painel `/admin/` → **Saúde** mostra o alerta em vermelho e os
arquivos saem sem assinatura.

Guarde o `.p12` fora do repositório e fora do backup do banco.

---

## 3. Registro no INPI e ATTR

A Portaria exige que o programa de registro de ponto tenha:

- **certificado de registro de programa de computador no INPI**; e
- **ATTR** — Atestado Técnico e Termo de Responsabilidade, assinado pelo
  responsável técnico e pelo representante legal do desenvolvedor, declarando
  expressamente que o programa atende à Portaria.

Como este sistema é desenvolvido para uso próprio da empresa, quem assina o
ATTR é o responsável técnico que a empresa designar (o desenvolvedor
contratado, ou o profissional de TI responsável). Guarde o documento junto do
contrato social — a fiscalização pede.

Preencha também `REP_IDENTIFICACAO` no `.env` com o número de identificação
declarado no ATTR (17 caracteres). Ele vai no cabeçalho do AFD e em todo
comprovante.

---

## Checklist antes de ligar em produção

- [ ] Leiaute do AFD conferido contra o Anexo I
- [ ] AFD de teste aprovado no validador oficial
- [ ] Certificado ICP-Brasil configurado e testado
- [ ] Registro no INPI e ATTR emitidos e arquivados
- [ ] `REP_IDENTIFICACAO` preenchido conforme o ATTR
- [ ] `CHAVE_BIOMETRIA` e `SEGREDO_SESSAO` gerados aleatoriamente (não os do exemplo)
- [ ] `NODE_ENV=production`
- [ ] `BIOMETRIA_DRIVER=agente` (nunca `simulador`)
- [ ] `REDES_AUTORIZADAS` restrito à rede real da empresa
- [ ] Disco do servidor cifrado; backup diário do `.db` e do `.env`, separados
- [ ] Termo de consentimento revisado pelo jurídico e assinado por todos
- [ ] Credencial alternativa testada com pelo menos uma pessoa
- [ ] Convenção coletiva da categoria consultada
- [ ] Comunicação prévia aos trabalhadores, por escrito
- [ ] Encarregado de dados (DPO) indicado e divulgado
