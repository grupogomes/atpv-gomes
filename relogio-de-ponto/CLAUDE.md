# Contexto para o Claude Code

REP-P (Registrador Eletrônico de Ponto por Programa) com identificação
biométrica, conforme art. 74 da CLT e Portaria MTP nº 671/2021.

Empresa: Grupo Gomes Despachante. Uso interno, nos computadores da empresa.

## Antes de mexer em qualquer coisa

Leia `README.md` e `docs/LEGISLACAO.md`. Este sistema tem restrições legais que
não são negociáveis por conveniência técnica:

1. **Marcação de ponto é imutável.** Não existe `UPDATE` nem `DELETE` em
   `registro` — há gatilhos no SQLite que abortam. Correção de jornada vai para
   `tratamento`, ao lado do original. Nunca contorne isso.
2. **Nunca bloquear ou restringir marcação.** A Portaria veda. Nada de recusar
   por horário, por escala, por intervalo mínimo. A única exceção é a janela
   antiduplicidade de segundos, que devolve o mesmo comprovante em vez de criar
   um segundo registro.
3. **Nunca marcação automática.** Não existe agendador nem rota que crie
   marcação sem digital presente.
4. **Três barreiras cumulativas para marcar**: rede autorizada (IP real do
   socket, `X-Forwarded-For` é ignorado de propósito), posto provisionado com
   token, e biometria. Não afrouxe nenhuma.
5. **O leiaute fiscal mora em dois arquivos**: `src/fiscal/leiaute.js` (AFD) e
   `LEIAUTE_AEJ` em `src/fiscal/aej.js`. Nenhum outro módulo conhece posição de
   campo. Ainda **falta conferir contra o Anexo I oficial** — ver
   `docs/HOMOLOGACAO.md`.
6. **Justificar não é abonar.** Atestado médico abona; declaração de
   comparecimento justifica sem abonar. Ver `src/dominio/naturezas.js`.
7. **Dado sensível**: template biométrico e CID ficam cifrados, nunca em texto
   claro, nunca em log. Leitura de CID vai para a auditoria.

## Comandos

```bash
npm install
npm run migrar        # cria o banco e registra o empregador a partir do .env
npm run seed          # primeiro administrador e primeiro posto (interativo)
npm start             # sobe o servidor
npm run teste         # 73 testes
npm run posto -- ID "Nome"   # provisiona um terminal
npm run afd -- 2026-08-01 2026-08-31
npm run aej -- 2026-08-01 2026-08-31
```

Stack: Node.js 20+, ESM puro sem passo de build, Express, better-sqlite3,
pdfkit. Front em HTML/CSS/JS sem framework nem CDN (a CSP é fechada).

## Testar sem o leitor

Com `BIOMETRIA_DRIVER=simulador`, a "digital" é uma palavra (senha de dedo),
definida em `POST /api/ponto/simulador/dedo` e no painel ao cadastrar. Com o
driver real essas rotas respondem 404 — ver `src/http/simulador.js`.

## Leitor

O leitor da empresa é um **NITGEN Hamster DX** (Fingertech é a distribuidora).
O agente em C# está em `agente-biometrico/nitgen/`, compilado pelo `csc.exe`
que já vem no Windows. Os pontos onde a API do eNBSP pode variar entre versões
estão marcados com `>>> CONFERIR` no código.

## Instalação

Windows: siga `docs/INSTALACAO-WINDOWS.md` (há um `instalar.ps1` que faz o
grosso). Linux/macOS: `docs/INSTALACAO.md`.

## Idioma

Código, comentários e documentação em português. Identificadores sem acento;
texto que aparece na tela **com** acentuação. Arquivos fiscais (AFD/AEJ) e o
comprovante de bobina térmica saem em ASCII, sem acento — isso é proposital.
