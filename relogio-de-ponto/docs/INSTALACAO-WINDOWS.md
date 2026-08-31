# Instalação no Windows

Roteiro para o computador da empresa. Se você tem o Claude Code instalado na
máquina, abra-o dentro da pasta do projeto e peça para ele seguir este
documento — ele executa os comandos e resolve o que der errado.

---

## 1. Trazer o projeto

Abra o **PowerShell** e rode:

```powershell
cd C:\
git clone https://github.com/grupogomes/atpv-gomes
cd atpv-gomes
git checkout claude/biometric-time-clock-41yx0w
cd relogio-de-ponto
```

Sem git na máquina? `winget install Git.Git`, feche e reabra o PowerShell.

## 2. Rodar o instalador

```powershell
powershell -ExecutionPolicy Bypass -File instalar.ps1
```

Ele confere o Node, instala as dependências, pergunta CNPJ, razão social e a
faixa de rede, gera as chaves de segurança, cria o banco, roda os testes e
oferece criar a tarefa que sobe o sistema junto com o Windows.

Não apaga nada. Se o `.env` já existir, pergunta antes de trocar.

> Para criar a tarefa agendada ele precisa de **PowerShell como
> administrador**. Sem isso o resto funciona igual, só o início automático fica
> de fora.

## 3. Criar o administrador e o primeiro posto

```powershell
npm run seed
```

Pergunta login, nome e senha do administrador (mínimo 10 caracteres) e oferece
provisionar o primeiro terminal. **Anote o token do posto** — ele aparece uma
única vez.

## 4. Subir e conferir

```powershell
npm start
```

- Quiosque: <http://localhost:3000/kiosk/>
- Administração: <http://localhost:3000/admin/>

No quiosque, cole o identificador e o token do posto. Ficam guardados no
navegador **daquela máquina** — é o que amarra o terminal ao lugar físico.

---

## Deixar o terminal em modo quiosque

Crie um atalho na área de trabalho apontando para:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --app=http://localhost:3000/kiosk/ --overscroll-history-navigation=0
```

Com Edge, troque o caminho por
`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.

Para abrir sozinho ao ligar: `Win+R` → `shell:startup` → arraste o atalho para
dentro dessa pasta.

**Endureça o terminal**: use uma conta do Windows **sem privilégio de
administrador** para quem opera o quiosque. Teclado e mouse são dispensáveis —
a tela tem dois botões.

## Como o RH acessa o painel

O servidor roda no PC do ponto. O RH abre o painel **do próprio computador**,
pela rede da empresa — não precisa de nada instalado no computador do RH, só
navegador.

**1. Descubra o IP do PC do ponto.** Nele, no PowerShell:

```powershell
ipconfig | Select-String 'IPv4'
```

Anote o número (algo como `192.168.0.15`).

**2. Libere a porta no firewall**, só para a rede privada:

```powershell
New-NetFirewallRule -DisplayName "Relogio de Ponto" -Direction Inbound `
  -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
```

**3. No computador do RH**, abra no navegador:

```
http://192.168.0.15:3000/admin/
```

Troque pelo IP que você anotou. Salve nos favoritos.

> **Fixe o IP do PC do ponto**, senão ele muda sozinho e o atalho quebra. O
> jeito certo é reservar o IP no roteador (reserva de DHCP pelo endereço MAC).
> Dá para fixar no Windows também, mas pela reserva no roteador é mais seguro
> — evita conflito com outro aparelho.

Isso vale **dentro da empresa**. De casa, não: a porta não deve ser exposta à
internet. Para acesso de fora existem dois caminhos, e o segundo é o melhor:

- **VPN** — o RH entra na rede da empresa e acessa como se estivesse lá;
- **espelhar para um servidor na nuvem** — o registro de ponto continua
  acontecendo aqui, local, e uma cópia sobe para a VPS só para consulta. É a
  arquitetura recomendada; ver abaixo.

## Levar para a nuvem depois

Quando quiser acessar de qualquer lugar, **não mova o registro de ponto para a
nuvem — espelhe.** A razão é dupla:

1. **O leitor é USB.** A digital só pode ser lida na máquina onde ele está
   plugado. A nuvem nunca vai ler dedo de ninguém.
2. **A marcação não pode depender da internet.** Se a conexão cair e o sistema
   estiver na nuvem, ninguém bate o ponto. Local, o ponto continua funcionando
   com a internet fora do ar.

Então o desenho certo é:

```
PC do ponto (fonte da verdade)        VPS (só leitura)
  leitor USB + agente                   painel do RH de qualquer lugar
  servidor REP-P                        cópia de segurança
  banco, AFD, AEJ          ──sobe──>    consulta e espelho
```

O que sobe é uma cópia; o original imutável fica aqui. Assim as três barreiras
antifraude (rede da empresa, posto autorizado, biometria) continuam inteiras, e
o RH ganha o acesso remoto.

Isso ainda não está implementado — é o passo seguinte, depois que a operação
local estiver rodando.

## Terminais em outros computadores

Se o quiosque roda em máquina diferente do servidor, troque `localhost` pelo IP
do servidor e libere a porta no firewall **apenas para a rede local**:

```powershell
New-NetFirewallRule -DisplayName "Relogio de Ponto" -Direction Inbound `
  -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
```

Confira o IP do servidor com `ipconfig` e ajuste `REDES_AUTORIZADAS` no `.env`.

> Nunca abra a porta 3000 para a internet. Se o RH precisa acessar de fora,
> use VPN.

## Leitor biométrico

O sistema sai configurado com `BIOMETRIA_DRIVER=simulador`, que **não serve
para produção** — o painel de Saúde avisa isso em vermelho.

Para o **NITGEN Hamster DX** (o mais comum no Brasil, distribuído pela
Fingertech) o agente já está pronto:

1. Baixe e instale o eNBSP SDK:
   <http://www.nitgen.com.br/download/eNBSP_SDK_v4.85.zip>
2. Plugue o leitor e confira no Gerenciador de Dispositivos.
3. Compile o agente:
   ```powershell
   cd agente-biometrico\nitgen
   .\compilar.ps1
   ```
4. Troque no `.env`:
   ```
   BIOMETRIA_DRIVER=agente
   ```

Se o SDK já estiver instalado quando você rodar o `instalar.ps1`, ele faz os
passos 3 e 4 sozinho. Passo a passo completo em
`agente-biometrico\nitgen\README.md`; outros fabricantes em
`agente-biometrico\README.md`.

Cadastre **dois dedos por pessoa**, de mãos diferentes: um curativo não pode
obrigar todo mundo a usar a credencial alternativa.

## Backup

O banco fica em `dados\ponto.db` e usa modo WAL — **copiar o arquivo com
`copy` pode sair inconsistente**. Use o comando de backup do próprio SQLite.
Salve como `backup.ps1` e agende no Agendador de Tarefas:

```powershell
$data = Get-Date -Format 'yyyyMMdd'
$destino = "D:\backup\ponto-$data.db"
node -e "const D=require('better-sqlite3'); const d=new D('./dados/ponto.db'); d.backup(process.argv[1]).then(()=>{console.log('ok');process.exit(0)})" $destino
Get-ChildItem D:\backup\ponto-*.db | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-180) } | Remove-Item
```

Guarde uma cópia do **`.env` em local separado do backup do banco**. Backup com
a chave junto anula a cifragem das biometrias; `.env` perdido significa
biometrias irrecuperáveis (as marcações continuam legíveis).

---

## Onde cada peça precisa morar

O leitor biométrico é USB. Isso decide o resto:

- **O agente biométrico roda obrigatoriamente no PC onde o leitor está
  plugado.** Não tem escapatória: o SDK do fabricante fala com o USB daquela
  máquina.
- **O servidor pode rodar em qualquer máquina da rede** — inclusive na mesma.

Para uma empresa pequena, a recomendação é **uma máquina só**: servidor,
agente e quiosque no computador da entrada, onde o leitor está. Menos peça,
menos ponto de falha, e o ponto continua funcionando mesmo que a rede caia. O
RH acessa `/admin/` do próprio computador, pela rede local.

Só separe o servidor se o PC da entrada for fraco, se houver mais de um
terminal, ou se aquele PC for desligado no fim do dia.

## Testar sem o leitor biométrico

Dá para conferir o sistema inteiro — cadastro, marcação, comprovante, espelho,
AFD — num computador que ainda não tem o leitor plugado. O instalador já deixa
`BIOMETRIA_DRIVER=simulador` por padrão, que é o modo de teste.

No lugar da digital, cada pessoa recebe uma **senha de dedo**: qualquer
palavra. A mesma palavra sempre identifica a mesma pessoa.

1. No painel, aba **Pessoas** → *Cadastrar digital*. Ele pergunta a senha de
   dedo — use o primeiro nome da pessoa, por exemplo.
2. No quiosque aparece uma tarja amarela **MODO DE TESTE** com um campo. Digite
   a mesma palavra e clique em *Registrar ponto*.

Palavra errada é recusada como digital não reconhecida, igual ao leitor real.

> Quando o leitor de verdade entrar (`BIOMETRIA_DRIVER=agente`), a tarja some
> sozinha e a rota que injeta a identidade deixa de existir — responde 404. Não
> há caminho para forjar identidade num sistema em produção.

O painel de **Saúde** acusa o modo simulador em vermelho enquanto ele estiver
ligado. Não coloque ninguém para bater ponto de verdade assim.

## Testar numa máquina e mover para outra

Testar antes num computador e depois levar para o definitivo é o caminho certo.
Três cuidados:

**1. Não leve o banco de teste.** Vá para produção com banco limpo — as
marcações de teste ficariam misturadas com as reais no AFD, e o AFD é imutável.
Apague `dados\ponto.db` na máquina definitiva antes de começar, ou simplesmente
não copie a pasta `dados\`.

**2. Não copie `node_modules`.** O `better-sqlite3` tem binário nativo compilado
para aquela máquina. Rode `npm install` no destino.

**3. Decida sobre as chaves.** O jeito mais limpo é clonar o projeto de novo no
computador definitivo e rodar o `instalar.ps1` lá, gerando chaves novas. As
biometrias do teste param de funcionar — o que é justamente o esperado, já que
elas eram de teste.

Resumindo, no computador definitivo:

```powershell
git clone https://github.com/grupogomes/atpv-gomes
cd atpv-gomes\relogio-de-ponto
git checkout claude/biometric-time-clock-41yx0w
powershell -ExecutionPolicy Bypass -File instalar.ps1
npm run seed
```

E provisione um posto novo para aquela máquina — o token do posto de teste não
vale mais nada lá:

```powershell
npm run posto -- RECEPCAO-01 "Recepção - terminal 1"
```

> **Depois que entrar em produção, nunca mais gere `CHAVE_BIOMETRIA` nova.**
> Ela é o que decifra os templates cadastrados. Perdê-la significa recadastrar
> a digital de todo mundo. As marcações continuam legíveis — elas não são
> cifradas — mas as biometrias, não.

---

## Quando der errado

| Sintoma | O que é |
|---|---|
| `npm install` falha em `better-sqlite3` com **"No prebuilt binaries found"** | é a **versão do Node**, não falta de ferramenta. O `better-sqlite3` só traz binário pronto para algumas versões e tentou compilar. Instale o Node 22 LTS: `winget install OpenJS.NodeJS --version 22.20.0`, feche e reabra o terminal, apague `node_modules` e rode de novo |
| `npm install` falha em `better-sqlite3` **sem** aquela linha | aí sim faltam as ferramentas de build: `winget install Microsoft.VisualStudio.2022.BuildTools`, marcando "Desenvolvimento para desktop com C++" |
| `node não é reconhecido` | feche e reabra o PowerShell depois de instalar o Node |
| `Este equipamento não está autorizado` | token do posto perdido (dados do navegador limpos) ou posto desativado — reemita com `npm run posto` |
| `Marcação só é aceita nos terminais da empresa` | o IP de origem está fora de `REDES_AUTORIZADAS` |
| Porta 3000 ocupada | troque `PORTA` no `.env` e ajuste o atalho do quiosque |
| Painel de Saúde acusa cadeia rompida | banco alterado por fora ou restauração parcial de backup — **investigue antes de continuar operando** |

## Antes de valer oficialmente

Leia [`HOMOLOGACAO.md`](HOMOLOGACAO.md). Faltam três providências que não são
de software: certificado **ICP-Brasil**, registro no **INPI** com emissão do
**ATTR**, e a **conferência do leiaute do AFD** contra o Anexo I da Portaria.
