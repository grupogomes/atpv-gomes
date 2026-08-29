# Biometria e LGPD

A digital do trabalhador é **dado pessoal sensível** (Lei 13.709/2018, art. 5º,
II). Isso muda o regime: não basta "ter cadastrado", é preciso base legal
específica, minimização, segurança reforçada e um caminho de saída para quem
recusar.

Este documento descreve o que o sistema já faz e o que a empresa precisa fazer.

---

## 1. Base legal

O art. 11 da LGPD lista as hipóteses para dado sensível. Aqui a combinação é:

- **art. 11, I** — consentimento específico e destacado do titular, para
  finalidade específica; e
- **art. 11, II, "a"** — cumprimento de obrigação legal do controlador: o
  controle de jornada do art. 74 da CLT.

O consentimento sozinho é frágil na relação de emprego (há assimetria entre
empregador e empregado, e a ANPD trata consentimento trabalhista com reserva).
Por isso ele vem **somado** à obrigação legal, e por isso a recusa não pode
gerar prejuízo — o que nos leva ao ponto seguinte.

### A alternativa é obrigatória

Quem recusa a biometria tem direito a registrar ponto por outro meio, sem
penalidade, desconto, advertência ou tratamento diferenciado. No sistema isso é
a **credencial alternativa** (`metodo: 'alternativo'`).

Se a alternativa não existir na prática, o consentimento não é livre — e o
tratamento inteiro fica sem base legal.

---

## 2. Minimização: template, nunca imagem

O leitor converte a digital num **template**: um vetor de pontos
característicos. O sistema guarda só isso, e cifrado.

```
biometria.template_cifr = AES-256-GCM( template )   # iv(12) || tag(16) || dados
```

- A imagem da digital **nunca** é gravada, nem em disco, nem em log.
- A chave (`CHAVE_BIOMETRIA`) fica fora do banco, no `.env`. Quem copiar o
  arquivo `.db` não obtém template nenhum.
- GCM é autenticado: template adulterado no banco **falha ao decifrar**, em vez
  de virar uma comparação silenciosamente ruim.
- Os templates são decifrados apenas em memória, pelo tempo da comparação 1:N.

E o mais importante: **a marcação de ponto não contém biometria**. O registro
tipo 7 guarda CPF, data/hora, posto e hash. Por isso a marcação pode ser
guardada 5 anos sem que isso signifique guardar dado sensível por 5 anos.

---

## 3. Prazos de retenção

| Dado | Prazo | Fundamento |
|---|---|---|
| Template biométrico | enquanto durar o contrato; eliminar em até **30 dias** após o desligamento | finalidade exaurida (LGPD art. 15, I e art. 16) |
| Marcações de ponto (AFD) | **5 anos** | CF art. 7º, XXIX; prescrição trabalhista |
| Consentimentos | enquanto durar o tratamento + prazo de defesa | LGPD art. 37 (registro das operações) |
| Auditoria de acesso | 6 meses no mínimo; recomendado 5 anos | Marco Civil, art. 15, por analogia |

A eliminação do template no desligamento **não é automática** neste sistema: é
uma rotina de RH. Coloque no checklist de desligamento — o painel de saúde
lista quem tem biometria ativa.

---

## 4. Direitos do titular (art. 18)

| Direito | Como atender |
|---|---|
| Confirmação e acesso | `/portal/` — o trabalhador vê as próprias marcações e baixa comprovantes |
| Correção | pelo RH, via tratamento de jornada, **sem apagar** o registro original |
| Eliminação do dado biométrico | painel → revogar consentimento; o template é zerado de fato e a pessoa passa a usar credencial alternativa |
| Revogação do consentimento | mesma operação; fica registrada com data e responsável |
| Informação sobre compartilhamento | não há: o dado não sai do servidor da empresa |

A revogação do consentimento elimina o template, **mas não apaga as marcações
já feitas** — elas são obrigação legal do empregador e permanecem. Isso está
escrito no termo, cláusula 4.

---

## 5. Termo de consentimento

O texto vive em `src/dominio/termo.js`, é **versionado**, e o que fica guardado
junto do consentimento é o **hash SHA-256 do texto efetivamente aceito**. Anos
depois dá para provar exatamente o que a pessoa leu.

Mudou o termo? Suba a versão. Consentimentos antigos continuam apontando para o
texto antigo, como deve ser.

---

## 6. Segurança (art. 46)

O que o sistema faz:

- template cifrado em repouso com AES-256-GCM;
- senhas e tokens de posto com scrypt e comparação em tempo constante;
- sessão administrativa com expiração de 8h; sessão de trabalhador, 15 minutos;
- auditoria de todo acesso, cadastro, exportação e uso de exceção;
- CSP restritiva e `X-Content-Type-Options` nas páginas;
- limitador de tentativas de login por IP.

O que **você** precisa fazer:

- rodar o servidor numa máquina da empresa, com disco cifrado (BitLocker ou
  LUKS) — o banco não substitui isso;
- se o acesso passar de uma máquina, usar **HTTPS**; sem TLS o token do posto
  trafega em claro na rede local;
- backup diário do `.db` **e** do `.env` (guardados **separadamente**: backup
  com a chave junto anula a cifragem);
- restringir quem tem papel `admin`;
- não expor o serviço à internet. Se precisar de acesso remoto do RH, use VPN.

---

## 7. Governança

- **Encarregado (DPO)** — indique e publique o contato (art. 41). Empresas de
  pequeno porte têm tratamento simplificado pela ANPD, mas o canal de contato
  continua exigível.
- **Registro das operações de tratamento** (art. 37) — este documento, somado ao
  esquema do banco, é a base dele.
- **Relatório de impacto (RIPD)** — recomendável por envolver dado sensível de
  todos os empregados. Deve descrever finalidade, base legal, fluxo, riscos e
  medidas de mitigação.
- **Incidente de segurança** (art. 48) — vazamento de template exige comunicação
  à ANPD e aos titulares em prazo razoável. Tenha um plano escrito antes de
  precisar dele.
