<#
.SYNOPSIS
    Instalador do REP-P (relogio de ponto) no Windows.

.DESCRIPTION
    Confere os requisitos, instala as dependencias, gera as chaves, escreve o
    .env, cria o banco e deixa o sistema pronto para subir.

    Nao apaga nada. Se o .env ja existir, pergunta antes de sobrescrever.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File instalar.ps1
#>

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz

function Titulo($texto) {
    Write-Host ""
    Write-Host "== $texto " -ForegroundColor Cyan -NoNewline
    Write-Host ("=" * [Math]::Max(0, 60 - $texto.Length)) -ForegroundColor DarkGray
}
function Ok($texto)    { Write-Host "  [ok] $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "  [!]  $texto" -ForegroundColor Yellow }
function Erro($texto)  { Write-Host "  [X]  $texto" -ForegroundColor Red }

function Perguntar($rotulo, $padrao) {
    if ($padrao) { $r = Read-Host "$rotulo [$padrao]" } else { $r = Read-Host $rotulo }
    if ([string]::IsNullOrWhiteSpace($r)) { return $padrao }
    return $r.Trim()
}

# Chave aleatoria de 32 bytes em base64, com RNG criptografico.
function NovaChave {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

Write-Host ""
Write-Host "  REP-P - Registrador Eletronico de Ponto" -ForegroundColor White
Write-Host "  Instalacao no Windows" -ForegroundColor DarkGray

# Pacote offline: quando existe um node.exe ao lado deste script, usamos ele.
# Assim a instalacao nao depende de Node instalado na maquina nem de internet.
$nodeEmbutido = Join-Path $raiz 'node.exe'
$modoOffline = Test-Path $nodeEmbutido
$node = if ($modoOffline) { $nodeEmbutido } else { 'node' }

# O INSTALAR.bat ja procurou o node.exe em varios lugares (PATH, registro do
# instalador, pastas conhecidas, nvm) e passa o caminho encontrado aqui. Nao
# repetimos a busca: aproveitamos, e ainda colocamos a pasta dele no PATH
# deste processo para que 'npm' tambem seja encontrado.
if (-not $modoOffline -and $env:NODE_EXE_PARA_PS -and (Test-Path $env:NODE_EXE_PARA_PS)) {
    $node = $env:NODE_EXE_PARA_PS
    $env:Path = (Split-Path -Parent $node) + ';' + $env:Path
}

# ---------------------------------------------------------------------------
Titulo "1. Requisitos"

if ($modoOffline) {
    # Pacote fechado: o Node vem junto e as dependencias ja estao prontas.
    Ok "Node.js embutido no pacote: $((& $node --version).Trim())"
    Ok "modo offline - nada para baixar"
} else {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Aviso "Node.js nao encontrado."
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            $r = Perguntar "  Instalar agora pelo winget? (S/n)" "S"
            if ($r.ToLower() -ne 'n') {
                Write-Host "  Instalando Node.js LTS..."
                & winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
                # O winget mexe no PATH, mas so vale para processos novos: recarregamos.
                $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
                            [Environment]::GetEnvironmentVariable('Path','User')
            }
        }
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            Erro "Node.js e obrigatorio."
            Write-Host "  Instale com:  winget install OpenJS.NodeJS.LTS" -ForegroundColor White
            Write-Host "  ou baixe em:  https://nodejs.org  (versao LTS)" -ForegroundColor White
            Write-Host "  Feche e reabra o terminal depois, e rode este script de novo."
            exit 1
        }
    }

    $versao = (& $node --version).TrimStart('v')
    $maior = [int]($versao.Split('.')[0])
    # 22.5 e a versao em que o Node passou a trazer SQLite embutido. Como o
    # sistema nao usa mais modulo nativo, e o unico requisito que resta.
    $menor = [int]($versao.Split('.')[1])
    if ($maior -lt 22 -or ($maior -eq 22 -and $menor -lt 5)) {
        Erro "Node.js $versao e antigo demais. O sistema exige 22.5 ou superior."
        Write-Host "  Atualize com:  winget upgrade OpenJS.NodeJS.LTS"
        exit 1
    }
    Ok "Node.js $versao"
}

# O npm mora na mesma pasta do node.exe. So e realmente necessario quando o
# pacote vem sem a pasta node_modules; num pacote fechado ele nao faz falta.
$npm = $null
$npmAoLado = Join-Path (Split-Path -Parent $node) 'npm.cmd'
if (Test-Path $npmAoLado) {
    $npm = $npmAoLado
} elseif (Get-Command npm -ErrorAction SilentlyContinue) {
    $npm = (Get-Command npm).Source
}
$precisaDeNpm = -not (Test-Path (Join-Path $raiz 'node_modules'))
if ($npm) {
    Ok "npm $((& $npm --version).Trim())"
} elseif ($precisaDeNpm) {
    Erro "npm nao encontrado (deveria vir junto com o Node)."
    exit 1
} else {
    Aviso "npm nao encontrado - nao faz falta: os componentes ja vem no pacote."
}

# ---------------------------------------------------------------------------
Titulo "2. Dependencias"

if (Test-Path (Join-Path $raiz 'node_modules')) {
    Ok "node_modules ja existe - pulando (apague a pasta para reinstalar)"
} else {
    Write-Host "  Baixando... (leva um ou dois minutos)"
    & $npm install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Erro "npm install falhou."
        Write-Host ""
        Write-Host "  O sistema nao tem nenhum componente que precise ser compilado," -ForegroundColor White
        Write-Host "  entao a causa quase sempre e conexao com a internet ou proxy." -ForegroundColor White
        Write-Host "  Verifique a conexao e tente de novo." -ForegroundColor White
        exit 1
    }
    Ok "dependencias instaladas"
}

# ---------------------------------------------------------------------------
Titulo "3. Configuracao"

$envPath = Join-Path $raiz '.env'
$escrever = $true
if (Test-Path $envPath) {
    Aviso ".env ja existe."
    $r = Read-Host "  Sobrescrever? Isso troca as chaves e INUTILIZA as biometrias ja cadastradas (s/N)"
    if ($r -ne 's') { $escrever = $false; Ok "mantendo o .env atual" }
}

if ($escrever) {
    Write-Host ""
    Write-Host "  Dados do empregador (vao no AFD e em todo comprovante):" -ForegroundColor White
    $cnpj  = (Perguntar "  CNPJ (so numeros)" "") -replace '\D',''
    while ($cnpj.Length -ne 14) {
        Aviso "CNPJ deve ter 14 digitos."
        $cnpj = (Perguntar "  CNPJ (so numeros)" "") -replace '\D',''
    }
    $razao    = Perguntar "  Razao social" "GRUPO GOMES DESPACHANTE LTDA"
    $endereco = Perguntar "  Endereco (rua, numero - cidade/UF)" ""

    # Sugere a faixa da rede local a partir do IP da propria maquina.
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
           Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
           Select-Object -First 1).IPAddress
    $sugestao = if ($ip) {
        $p = $ip.Split('.'); "127.0.0.1/32,$($p[0]).$($p[1]).$($p[2]).0/24"
    } else { "127.0.0.1/32" }

    Write-Host ""
    Write-Host "  Redes de onde o ponto pode ser batido." -ForegroundColor White
    Write-Host "  Fora destas faixas o sistema RECUSA a marcacao - e o que impede" -ForegroundColor DarkGray
    Write-Host "  marcar de casa ou pelo celular fora da empresa." -ForegroundColor DarkGray
    $redes = Perguntar "  Redes autorizadas (CIDR)" $sugestao

    Write-Host ""
    Write-Host "  Abono de consulta: a declaracao de comparecimento NAO obriga o" -ForegroundColor DarkGray
    Write-Host "  abono pela lei. Responda 's' apenas se a convencao coletiva da" -ForegroundColor DarkGray
    Write-Host "  categoria prever, ou se a empresa ja abona habitualmente." -ForegroundColor DarkGray
    $abono = if ((Perguntar "  Abonar consulta por padrao? (s/N)" "N").ToLower() -eq 's') { 'true' } else { 'false' }

    $conteudo = @"
# Gerado por instalar.ps1 em $(Get-Date -Format 'dd/MM/yyyy HH:mm')
# NAO versione este arquivo e NAO guarde o backup dele junto do banco.

EMPREGADOR_TIPO_ID=1
EMPREGADOR_DOCUMENTO=$cnpj
EMPREGADOR_RAZAO_SOCIAL=$razao
EMPREGADOR_ENDERECO=$endereco
EMPREGADOR_CNO_CAEPF=

# Numero declarado no ATTR. Troque quando o atestado tecnico for emitido.
REP_IDENTIFICACAO=REPP0000000000001

PORTA=3000
HOST=0.0.0.0
REDES_AUTORIZADAS=$redes

# Chaves geradas aleatoriamente nesta maquina. Guarde uma copia em local
# seguro: sem CHAVE_BIOMETRIA nenhuma digital cadastrada volta a funcionar.
CHAVE_BIOMETRIA=$(NovaChave)
SEGREDO_SESSAO=$(NovaChave)

FUSO=-03:00
BANCO=./dados/ponto.db

# 'simulador' so para testar sem leitor. Troque para 'agente' quando o
# agente biometrico estiver instalado (ver agente-biometrico/README.md).
BIOMETRIA_DRIVER=simulador
BIOMETRIA_AGENTE_URL=http://127.0.0.1:9010

ABONA_CONSULTA=$abono

NODE_ENV=production
"@
    Set-Content -Path $envPath -Value $conteudo -Encoding UTF8
    Ok ".env criado"
    Aviso "Guarde uma copia do .env FORA do backup do banco."
}

# ---------------------------------------------------------------------------
Titulo "4. Banco de dados"

& $node (Join-Path $raiz 'src\db\migrar.js')
if ($LASTEXITCODE -ne 0) { Erro "Falha ao criar o banco."; exit 1 }
Ok "banco pronto em dados\ponto.db"

# ---------------------------------------------------------------------------
Titulo "5. Testes"

& $node --test (Join-Path $raiz 'teste') 2>&1 | Select-String -Pattern '^# (tests|pass|fail)'
if ($LASTEXITCODE -ne 0) { Aviso "Algum teste falhou - revise antes de usar em producao." }
else { Ok "todos os testes passaram" }

# ---------------------------------------------------------------------------
Titulo "6. Iniciar junto com o Windows"

$r = Perguntar "  Criar a tarefa que sobe o sistema ao ligar o PC? (S/n)" "S"
if ($r.ToLower() -ne 'n') {
    $nodeExe = if ($node -eq 'node') { (Get-Command node).Source } else { $node }
    $acao   = New-ScheduledTaskAction -Execute $nodeExe -Argument 'src\index.js' -WorkingDirectory $raiz
    $gatilho = New-ScheduledTaskTrigger -AtStartup
    $config  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
               -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    try {
        Register-ScheduledTask -TaskName 'RelogioDePonto' -Action $acao -Trigger $gatilho `
            -Settings $config -RunLevel Highest -Force | Out-Null
        Ok "tarefa 'RelogioDePonto' criada"
        Write-Host "     iniciar agora:  Start-ScheduledTask -TaskName RelogioDePonto" -ForegroundColor DarkGray
        Write-Host "     remover:        Unregister-ScheduledTask -TaskName RelogioDePonto" -ForegroundColor DarkGray
    } catch {
        Aviso "Nao foi possivel criar a tarefa: $($_.Exception.Message)"
        Write-Host "     Rode este script como administrador, ou suba manualmente com 'npm start'."
    }
}

# ---------------------------------------------------------------------------
Titulo "7. Leitor biometrico"

$pastaAgente = Join-Path $raiz 'agente-biometrico\nitgen'
$exeAgente = Join-Path $pastaAgente 'agente-nitgen.exe'

if (Test-Path $exeAgente) {
    Ok "agente NITGEN ja compilado"
} else {
    # Procura so nos lugares obvios: varrer o disco inteiro aqui seria lento.
    $sdk = @(
        "$env:ProgramFiles\NITGEN\eNBSP SDK\Bin\NITGEN.SDK.NBioBSP.dll",
        "${env:ProgramFiles(x86)}\NITGEN\eNBSP SDK\Bin\NITGEN.SDK.NBioBSP.dll",
        (Join-Path $pastaAgente 'NITGEN.SDK.NBioBSP.dll')
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($sdk) {
        Ok "SDK da NITGEN encontrado"
        $r = Perguntar "  Compilar o agente do leitor agora? (S/n)" "S"
        if ($r.ToLower() -ne 'n') {
            & powershell -ExecutionPolicy Bypass -File (Join-Path $pastaAgente 'compilar.ps1')
            if (Test-Path $exeAgente) {
                # So agora vale ligar o driver real.
                (Get-Content $envPath) -replace '^BIOMETRIA_DRIVER=.*', 'BIOMETRIA_DRIVER=agente' |
                    Set-Content $envPath -Encoding UTF8
                Ok "agente compilado e BIOMETRIA_DRIVER trocado para 'agente'"
            }
        }
    } else {
        Aviso "SDK da NITGEN nao encontrado - seguindo em MODO DE TESTE."
        Write-Host "     O sistema funciona para conferir tudo, mas ninguem bate ponto"
        Write-Host "     de verdade assim. Para ligar o leitor Hamster DX:"
        Write-Host "       1. baixe http://www.nitgen.com.br/download/eNBSP_SDK_v4.85.zip"
        Write-Host "       2. instale e plugue o leitor"
        Write-Host "       3. rode  agente-biometrico\nitgen\compilar.ps1"
        Write-Host "     Detalhes em agente-biometrico\nitgen\README.md"
    }
}

# ---------------------------------------------------------------------------
Titulo "Pronto"

Write-Host ""
Write-Host "  Faltam tres passos, nesta ordem:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Criar o administrador e o primeiro posto:" -ForegroundColor White
Write-Host $(if ($modoOffline) { "       (o INSTALAR.bat ja faz isso a seguir)" } else { "       npm run seed" }) -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Subir o sistema:" -ForegroundColor White
Write-Host $(if ($modoOffline) { "       clique duas vezes em INICIAR.bat" } else { "       npm start" }) -ForegroundColor Gray
Write-Host "     Quiosque ......  http://localhost:3000/kiosk/" -ForegroundColor Gray
Write-Host "     Administracao .  http://localhost:3000/admin/" -ForegroundColor Gray
Write-Host ""
if (-not (Test-Path $exeAgente)) {
    Write-Host "  3. Ligar o leitor biometrico (hoje em MODO DE TESTE):" -ForegroundColor White
    Write-Host "       agente-biometrico\nitgen\README.md" -ForegroundColor Gray
} else {
    Write-Host "  3. Deixar o agente do leitor rodando sempre:" -ForegroundColor White
    Write-Host "       agente-biometrico\nitgen\README.md  (secao 5)" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  Antes de usar oficialmente, leia docs\HOMOLOGACAO.md:" -ForegroundColor Yellow
Write-Host "  faltam o certificado ICP-Brasil, o registro no INPI/ATTR e a" -ForegroundColor Yellow
Write-Host "  conferencia do leiaute do AFD contra o Anexo I da Portaria." -ForegroundColor Yellow
Write-Host ""
