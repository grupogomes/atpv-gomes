# Instalação no computador da empresa

Cenário alvo: um servidor (pode ser o próprio computador do RH) rodando o
REP-P, e um ou mais computadores na entrada servindo de terminal, cada um com
um leitor biométrico USB.

Se a empresa tiver um único computador, ele acumula os dois papéis — o sistema
funciona assim sem ajuste nenhum.

---

## 1. Servidor

### Requisitos
- Node.js 20.11 ou superior
- 500 MB de disco (o banco cresce ~1 MB por 10 mil marcações)
- IP fixo na rede local

### Instalação

```bash
git clone <este-repositorio> /opt/relogio-de-ponto
cd /opt/relogio-de-ponto
npm install --omit=dev
cp .env.exemplo .env
```

Edite o `.env`:

```bash
EMPREGADOR_TIPO_ID=1
EMPREGADOR_DOCUMENTO=00000000000000        # CNPJ, só dígitos
EMPREGADOR_RAZAO_SOCIAL=SUA EMPRESA LTDA
EMPREGADOR_ENDERECO=Rua Exemplo, 100 - São Paulo/SP
REP_IDENTIFICACAO=REPP0000000000001        # conforme o ATTR

# Só estas faixas registram ponto. Restrinja à sua rede real.
REDES_AUTORIZADAS=192.168.0.0/24

# Gere cada uma com:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CHAVE_BIOMETRIA=
SEGREDO_SESSAO=

BIOMETRIA_DRIVER=agente
BIOMETRIA_AGENTE_URL=http://127.0.0.1:9010
NODE_ENV=production
```

```bash
npm run migrar
npm run seed        # cria o administrador e o primeiro posto
npm start
```

### Deixar rodando sempre

**Linux (systemd)** — `/etc/systemd/system/relogio-ponto.service`:

```ini
[Unit]
Description=REP-P - Relogio de Ponto
After=network.target

[Service]
Type=simple
User=ponto
WorkingDirectory=/opt/relogio-de-ponto
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now relogio-ponto
```

**Windows** — use [NSSM](https://nssm.cc/) ou o Agendador de Tarefas com
gatilho "ao iniciar o sistema":

```
nssm install RelogioPonto "C:\Program Files\nodejs\node.exe" "src\index.js"
nssm set RelogioPonto AppDirectory C:\relogio-de-ponto
nssm start RelogioPonto
```

---

## 2. Terminal de marcação

### Provisionar

No servidor:

```bash
npm run posto -- RECEPCAO-01 "Recepção — terminal 1"
```

Anote o token. **Ele aparece uma única vez.**

### Configurar o computador do terminal

1. Instale o agente biométrico (ver `agente-biometrico/README.md`) e conecte o
   leitor USB.
2. Abra `http://IP-DO-SERVIDOR:3000/kiosk/` no navegador.
3. Cole o identificador e o token do posto. Ficam guardados no `localStorage`
   **daquele navegador, naquela máquina**.
4. Coloque o navegador em modo quiosque, para ninguém sair da tela:

   **Chrome / Edge**
   ```
   chrome.exe --kiosk --app=http://192.168.0.10:3000/kiosk/ ^
              --disable-pinch --overscroll-history-navigation=0
   ```

   **Firefox**: `about:config` → `browser.fullscreen.autohide = true`, e abra
   com `firefox --kiosk`.

5. Coloque o atalho na inicialização do Windows
   (`shell:startup`) ou no autostart do Linux.

> Se alguém limpar os dados do navegador, o terminal volta a pedir id e token.
> Isso é proposital: um terminal só volta a registrar com autorização.

### Endurecer o terminal (recomendado)

- conta de usuário do Windows **sem privilégio de administrador**;
- desabilitar `Ctrl+Alt+Del` → Gerenciador de Tarefas por política de grupo;
- teclado e mouse podem ser dispensados: a tela só tem dois botões.

---

## 3. Rede

O sistema recusa qualquer marcação vinda de fora de `REDES_AUTORIZADAS`, usando
o **IP real do socket** — cabeçalhos `X-Forwarded-For` são ignorados de
propósito, justamente porque quem faz a requisição controla o cabeçalho.

Consequências práticas:

- **Não coloque o serviço atrás de um proxy reverso** sem reavaliar essa
  checagem: o proxy faria toda requisição parecer vir dele.
- **Não exponha a porta 3000 à internet.** Se o RH precisa acessar de fora, use
  VPN — o `/admin/` continua exigindo login, mas a superfície não precisa estar
  pública.
- Se houver Wi-Fi de visitantes, mantenha-o em VLAN separada e **fora** de
  `REDES_AUTORIZADAS`.

### HTTPS

Se o acesso passar de uma única máquina, use TLS. Sem ele, o token do posto
trafega em claro na rede local. Um proxy TLS local (Caddy, nginx) na mesma
máquina, escutando 443 e encaminhando para 127.0.0.1:3000, resolve — nesse
caso, ajuste `REDES_AUTORIZADAS` para incluir `127.0.0.1/32` e faça a checagem
de rede real no firewall.

---

## 4. Rotina do dia a dia

| Quando | O quê |
|---|---|
| Admissão | cadastrar no `/admin/`, colher o termo, cadastrar **dois dedos** (mãos diferentes) |
| Diária | conferir `/admin/` → Saúde; leitor e cadeia de integridade em ordem |
| Mensal | gerar espelho, tratar pendências, gerar **AFD e AEJ** e arquivar |
| Desligamento | inativar o cadastro e **eliminar o template biométrico** |
| Sempre | backup diário do `.db` e do `.env`, guardados separadamente |

### Backup

```bash
#!/bin/sh
# /opt/relogio-de-ponto/backup.sh
DATA=$(date +%Y%m%d)
sqlite3 /opt/relogio-de-ponto/dados/ponto.db ".backup /backup/ponto-$DATA.db"
find /backup -name 'ponto-*.db' -mtime +180 -delete
```

Use `.backup` do sqlite3, não `cp`: o banco está em modo WAL e uma cópia crua
pode sair inconsistente.

---

## 5. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Este equipamento não está autorizado" | token do posto perdido (dados do navegador limpos) ou posto desativado — reemita |
| "Marcação só é aceita nos terminais da empresa" | IP fora de `REDES_AUTORIZADAS`, ou serviço atrás de proxy |
| "Leitor indisponível" | agente biométrico parado ou leitor desconectado |
| "Digital não reconhecida" | dedo seco, sensor sujo, ou só um dedo cadastrado — cadastre dois |
| Painel de saúde acusa cadeia rompida | banco alterado por fora **ou** restauração de backup parcial. Investigue antes de continuar operando |
