# Agente biométrico

Pequeno serviço que roda **no computador onde o leitor USB está plugado** e
expõe HTTP em `127.0.0.1:9010`. O REP-P conversa com ele; ele conversa com o
SDK do fabricante.

## Por que separado do sistema principal

Os SDKs de leitores biométricos são bibliotecas nativas — DLL no Windows, `.so`
no Linux, quase sempre com binding para C#, C++ ou Java. Nenhuma delas roda
dentro do Node sem ginástica, e todas precisam estar na máquina onde o USB
está.

Separando, três coisas melhoram:

1. o núcleo fiscal do REP-P (livro-razão, AFD, AEJ, comprovante) não depende de
   marca de leitor e não precisa ser mexido quando o leitor trocar;
2. dá para ter vários terminais, cada um com seu agente e seu leitor;
3. a homologação do leitor não contamina a homologação do programa de ponto.

## Leitores comuns no Brasil

| Fabricante | SDK | Observação |
|---|---|---|
| **Nitgen (Hamster DX, III, II)** | eNBSP SDK (C/C#) | **já implementado** — ver [`nitgen/`](nitgen/) |
| Digital Persona / HID (U.are.U 4500) | U.are.U SDK (C/Java/.NET) | template ANSI/ISO |
| Futronic (FS80, FS88) | FTRAPI (C) | |
| Control iD (iDBio) | SDK próprio / REST | alguns modelos já expõem HTTP |
| Fingertech | SDK próprio | |

Se o seu leitor **já expõe uma API HTTP** (caso de alguns Control iD), o agente
vira um adaptador fino: traduza as respostas dele para o formato abaixo.

## Já pronto: NITGEN Hamster DX

Se o seu leitor é um **Hamster DX** (ou Hamster II/III), o agente já está
escrito: [`nitgen/README.md`](nitgen/README.md). Baixe o eNBSP SDK, rode
`nitgen\compilar.ps1` e pronto.

O Hamster DX é fabricado pela **NITGEN**; a Fingertech é a distribuidora no
Brasil. O SDK a baixar é o da Nitgen.

## Como escrever o seu (outros fabricantes)

Implemente as três rotas de [`PROTOCOLO.md`](PROTOCOLO.md). Há um exemplo
funcional em `exemplo-agente.js`, com o ponto exato onde entra a chamada ao SDK
marcado com `// >>> AQUI ENTRA O SDK DO FABRICANTE`.

```bash
node agente-biometrico/exemplo-agente.js
```

Depois aponte o REP-P para ele:

```bash
BIOMETRIA_DRIVER=agente
BIOMETRIA_AGENTE_URL=http://127.0.0.1:9010
```

## Regras que o agente precisa respeitar

- **Escutar apenas em `127.0.0.1`.** O agente não tem autenticação; ele depende
  de estar acessível só localmente. Nunca abra em `0.0.0.0`.
- **Nunca gravar imagem de digital** em disco, log ou tela.
- **Nunca guardar template** — quem guarda é o REP-P, cifrado. O agente é
  passagem.
- Devolver template em **base64** e qualidade em **0–100**.
- Na identificação 1:N, comparar contra a lista recebida e devolver o **melhor
  casamento acima do limiar**, não o primeiro que passar.
