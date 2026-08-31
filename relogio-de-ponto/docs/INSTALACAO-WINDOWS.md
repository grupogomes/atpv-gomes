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

Para usar o leitor de verdade, instale o agente que conversa com o SDK do
fabricante (`agente-biometrico\README.md`), conecte o leitor USB, e troque no
`.env`:

```
BIOMETRIA_DRIVER=agente
```

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

## Quando der errado

| Sintoma | O que é |
|---|---|
| `npm install` falha em `better-sqlite3` | faltam ferramentas de build: `winget install Microsoft.VisualStudio.2022.BuildTools`, marcando "Desenvolvimento para desktop com C++" |
| `node não é reconhecido` | feche e reabra o PowerShell depois de instalar o Node |
| `Este equipamento não está autorizado` | token do posto perdido (dados do navegador limpos) ou posto desativado — reemita com `npm run posto` |
| `Marcação só é aceita nos terminais da empresa` | o IP de origem está fora de `REDES_AUTORIZADAS` |
| Porta 3000 ocupada | troque `PORTA` no `.env` e ajuste o atalho do quiosque |
| Painel de Saúde acusa cadeia rompida | banco alterado por fora ou restauração parcial de backup — **investigue antes de continuar operando** |

## Antes de valer oficialmente

Leia [`HOMOLOGACAO.md`](HOMOLOGACAO.md). Faltam três providências que não são
de software: certificado **ICP-Brasil**, registro no **INPI** com emissão do
**ATTR**, e a **conferência do leiaute do AFD** contra o Anexo I da Portaria.
