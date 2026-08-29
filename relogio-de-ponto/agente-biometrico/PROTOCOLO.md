# Protocolo do agente biométrico

HTTP/JSON em `127.0.0.1:9010`. Três rotas.

---

## `GET /status`

Verifica se o leitor está presente e pronto. O quiosque chama a cada 20s.

**Resposta**

```json
{
  "disponivel": true,
  "modelo": "Nitgen Hamster DX",
  "detalhe": "firmware 2.10"
}
```

Leitor desconectado → `{"disponivel": false, "detalhe": "leitor nao encontrado"}`
com status HTTP 200. Reserve os códigos de erro para falhas do próprio agente.

---

## `POST /capturar`

Acende o sensor e espera um dedo. Usado tanto na marcação quanto no cadastro.

**Requisição**

```json
{ "timeoutMs": 20000 }
```

**Resposta**

```json
{
  "template": "Base64DoTemplate==",
  "qualidade": 87,
  "modelo": "Nitgen Hamster DX"
}
```

Ninguém encostou o dedo dentro do prazo → HTTP 408, ou 200 com
`{"template": null}`. O REP-P trata os dois como "sem captura".

O template deve ser o do **SDK do fabricante**, no formato que o mesmo SDK usa
para comparar. Se o SDK suportar ANSI 378 ou ISO 19794-2, prefira — isso
permite trocar de leitor sem recadastrar todo mundo.

---

## `POST /identificar`

Compara um template capturado contra os cadastrados (1:N).

**Requisição**

```json
{
  "template": "Base64DoTemplateCapturado==",
  "limiar": 60,
  "candidatos": [
    { "id": 12, "template": "Base64==" },
    { "id": 34, "template": "Base64==" }
  ]
}
```

**Resposta — encontrou**

```json
{ "encontrado": true, "id": 12, "score": 91, "modelo": "Nitgen Hamster DX" }
```

**Resposta — não encontrou**

```json
{ "encontrado": false }
```

### Sobre o limiar

`score` vai de 0 a 100. O REP-P **rechecha** o limiar depois de receber a
resposta, então o agente não pode "afrouxar" a comparação por conta própria.

Calibre com cuidado: limiar baixo aceita a pessoa errada (falso positivo — é a
fraude que o sistema existe para impedir); limiar alto rejeita a pessoa certa e
empurra todo mundo para a credencial alternativa. O padrão do REP-P é 60,
ajustável em `BIOMETRIA_SCORE_MINIMO`. Suba se o seu SDK reportar score
otimista.

### Desempenho

A comparação 1:N é feita a cada marcação, com fila de gente esperando. Até umas
200 pessoas, comparar em laço resolve. Acima disso, use o modo de identificação
do próprio SDK (a maioria tem um, otimizado em C) em vez de laço no seu código.
