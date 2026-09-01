@echo off
REM ===========================================================================
REM  Verificacao do leitor biometrico
REM
REM  ARQUIVO UNICO: o PowerShell que faz o trabalho esta aqui dentro mesmo,
REM  depois da marca :::PS:::. O .bat le a si proprio, corta tudo ate a marca
REM  e executa o resto. Assim nao ha um segundo arquivo para perder de vista.
REM ===========================================================================

title Verificacao do leitor biometrico
cd /d "%~dp0"
set "PASTA_RELOGIO=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$l = Get-Content -LiteralPath '%~f0'; $m = $l | Select-String -Pattern '^:::PS:::$' | Select-Object -First 1; if (-not $m) { Write-Host '  Arquivo incompleto - baixe de novo.' -ForegroundColor Red; exit 1 }; Invoke-Expression (($l | Select-Object -Skip $m.LineNumber) -join [Environment]::NewLine)"

echo.
pause
exit /b

:::PS:::
<#
    Verifica o que ja existe nesta maquina para o leitor NITGEN, SEM instalar
    nem mexer em nada. Util quando o leitor ja e usado por outro sistema: o
    SDK costuma vir junto, e nesse caso nao ha o que baixar.

    Saida sem acento de proposito: o console do Windows troca a tabela de
    caracteres conforme a maquina e acento vira lixo na tela.
#>

$ErrorActionPreference = 'SilentlyContinue'

function Titulo($t) { Write-Host ""; Write-Host "  $t" -ForegroundColor White; Write-Host "  $('-' * $t.Length)" -ForegroundColor DarkGray }
function Ok($t)     { Write-Host "  [ok]  $t" -ForegroundColor Green }
function Nao($t)    { Write-Host "  [nao] $t" -ForegroundColor Yellow }
function Info($t)   { Write-Host "        $t" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor White
Write-Host "     LEITOR BIOMETRICO - O QUE JA EXISTE NESTA MAQUINA" -ForegroundColor White
Write-Host "  ============================================================" -ForegroundColor White
Write-Host "  Este script so OLHA. Nao instala nem altera nada." -ForegroundColor DarkGray

# A pasta onde estamos. Quando este script roda embutido no .bat nao existe
# MyInvocation.MyCommand.Path, entao o .bat passa o caminho por variavel.
$aqui = $PSScriptRoot
if (-not $aqui) { $aqui = $env:PASTA_RELOGIO }
if (-not $aqui) { $aqui = (Get-Location).Path }
$aqui = $aqui.TrimEnd('\')
$temSdk = $false
$temNativa = $false
$temLeitor = $false

# ---------------------------------------------------------------------------
Titulo "1. O leitor esta plugado e reconhecido?"

$dispositivos = @()
$dispositivos += Get-PnpDevice -Class Biometric |
                 Where-Object { $_.Status -ne 'Unknown' }
$dispositivos += Get-PnpDevice |
                 Where-Object { $_.FriendlyName -match 'NITGEN|Hamster|Fingkey|eNBio|FDU' }
$dispositivos = $dispositivos | Sort-Object InstanceId -Unique

if ($dispositivos) {
    $fantasmas = 0
    foreach ($d in $dispositivos) {
        if ($d.Status -eq 'OK') { $temLeitor = $true; Ok "$($d.FriendlyName)" }
        else { $fantasmas++; Nao "$($d.FriendlyName) - situacao: $($d.Status)" }
    }
    if ($temLeitor -and $fantasmas -gt 0) {
        Info ""
        Info "A linha [nao] acima e um registro antigo do MESMO leitor, de"
        Info "quando ele foi plugado noutra porta USB. Nao atrapalha e nao"
        Info "precisa ser removida. O que vale e a linha [ok]."
    }
} else {
    Nao "Nenhum leitor biometrico encontrado."
    Info "Plugue o leitor numa porta USB e rode de novo."
}

# ---------------------------------------------------------------------------
Titulo "2. O SDK da NITGEN esta instalado?"

# Sao dois arquivos com papeis diferentes, e a ausencia de um nao implica a
# do outro:
#   NBioBSP.dll            - o motor, nativo. Um sistema que use o leitor
#                            provavelmente tem este, ainda que escondido na
#                            pasta dele.
#   NITGEN.SDK.NBioBSP.dll - a casca para .NET, que e o que o nosso agente
#                            usa. Vem no mesmo eNBSP SDK.
# Por isso varremos por *NBioBSP*.dll: pega os dois de uma vez.

$lugares = @(
    (Join-Path $aqui 'NITGEN.SDK.NBioBSP.dll'),
    (Join-Path $aqui 'agente-biometrico\nitgen\NITGEN.SDK.NBioBSP.dll'),
    "$env:ProgramFiles\NITGEN\eNBSP SDK\Bin\NITGEN.SDK.NBioBSP.dll",
    "${env:ProgramFiles(x86)}\NITGEN\eNBSP SDK\Bin\NITGEN.SDK.NBioBSP.dll",
    "$env:WINDIR\System32\NITGEN.SDK.NBioBSP.dll",
    "$env:WINDIR\SysWOW64\NITGEN.SDK.NBioBSP.dll"
)
$dll = $lugares | Where-Object { Test-Path $_ } | Select-Object -First 1

$nativas = @()
if (-not $dll) {
    Info "Nao estava nos lugares de sempre. Procurando no disco C:..."
    Info "(pode levar um ou dois minutos)"
    $todas = Get-ChildItem C:\ -Filter '*NBioBSP*.dll' -Recurse -File
    $dll = $todas | Where-Object { $_.Name -eq 'NITGEN.SDK.NBioBSP.dll' } |
           Select-Object -First 1 -ExpandProperty FullName
    $nativas = $todas | Where-Object { $_.Name -eq 'NBioBSP.dll' }
}

if ($dll) {
    $temSdk = $true
    Ok "NITGEN.SDK.NBioBSP.dll encontrada"
    Info $dll
    $v = (Get-Item $dll).VersionInfo.FileVersion
    if ($v) { Info "versao do arquivo: $v" }
} else {
    Nao "NITGEN.SDK.NBioBSP.dll (a casca .NET) nao existe nesta maquina."
}

# A nativa pode existir sozinha: e o caso de quem tem outro sistema usando o
# leitor sem o SDK de desenvolvimento instalado.
if (-not $nativas -and $dll) {
    $aoLado = Join-Path (Split-Path $dll) 'NBioBSP.dll'
    if (Test-Path $aoLado) { $nativas = @(Get-Item $aoLado) }
}
if (-not $nativas -and -not $dll) {
    # ja varremos acima; nada a fazer
}

if ($nativas -and $nativas.Count -gt 0) {
    $temNativa = $true
    Ok "NBioBSP.dll (o motor nativo) encontrada em:"
    foreach ($n in $nativas) { Info $n.FullName }
    if (-not $dll) {
        Info ""
        Info "Ou seja: o motor esta na maquina (provavelmente do outro"
        Info "sistema que usa o leitor), mas falta a casca .NET. Ela vem"
        Info "no eNBSP SDK - instale o SDK completo, nao copie DLL solta."
    }
} else {
    Nao "NBioBSP.dll (o motor nativo) nao encontrada."
}

if (-not $temSdk) {
    Info ""
    Info "Baixe o eNBSP SDK em:"
    Info "  http://www.nitgen.com.br/download/eNBSP_SDK_v4.85.zip"
    Info "Se o link nao abrir, procure por 'eNBSP SDK' no site da Nitgen"
    Info "ou peca a DLL a quem instalou o outro sistema."
}

Titulo "3. Que outro programa esta usando o leitor agora?"

# Um programa que carregou a NBioBSP.dll esta falando com o leitor. Dois
# programas nao costumam conseguir abrir o mesmo leitor ao mesmo tempo.
$usando = @()
foreach ($p in Get-Process) {
    # Ler os modulos de um processo do sistema costuma dar acesso negado.
    # Nesses casos seguimos em frente: nao e um processo que nos interessa.
    try {
        foreach ($m in $p.Modules) {
            if ($m.ModuleName -match '^NBioBSP') { $usando += $p.ProcessName; break }
        }
    } catch { }
}
$usando = $usando | Sort-Object -Unique

if ($usando) {
    foreach ($u in $usando) { Nao "$u esta com o leitor aberto" }
    Info "Dois programas nao abrem o mesmo leitor ao mesmo tempo."
    Info "Feche esse programa antes de testar o agente do ponto."
} else {
    Ok "Nenhum programa esta com o leitor aberto no momento."
}

# ---------------------------------------------------------------------------
Titulo "4. O que falta para compilar o agente"

$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4.0.*\csc.exe" | Select-Object -Last 1
if (-not $csc) { $csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework\v4.0.*\csc.exe" | Select-Object -Last 1 }
if ($csc) { Ok "compilador C# presente" } else { Nao "compilador C# (csc.exe) ausente - falta o .NET Framework 4.x" }

# O registro responde sem exigir administrador; o Get-WindowsOptionalFeature
# exige, e antes disso a resposta aqui era so "nao foi possivel consultar".
$net35 = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v3.5' -Name Install).Install
if ($net35 -eq 1) { Ok ".NET Framework 3.5 instalado" }
else {
    Nao ".NET Framework 3.5 ausente - o SDK precisa dele em Windows 64 bits"
    Info "Ligue assim, num PowerShell como administrador:"
    Info "  Enable-WindowsOptionalFeature -Online -FeatureName NetFx3 -All"
}

# ---------------------------------------------------------------------------
Titulo "Resumo"

if ($temSdk -and $temNativa) {
    Ok "O SDK JA ESTA INSTALADO. Nao precisa baixar nada."
    Write-Host ""
    Write-Host "  Proximo passo - compilar o agente:" -ForegroundColor White
    Write-Host "    .\compilar.ps1" -ForegroundColor Gray
} elseif ($temSdk) {
    Nao "O SDK esta parcialmente presente: falta a NBioBSP.dll nativa."
    Info "Tente compilar assim mesmo; se reclamar de DLL, reinstale o SDK."
} else {
    Nao "O SDK precisa ser instalado antes de qualquer outra coisa."
}

if (-not $temLeitor) {
    Write-Host ""
    Nao "Sem o leitor plugado nao da para testar de verdade."
}

Write-Host ""
Write-Host "  Mande esta tela inteira para o suporte." -ForegroundColor DarkGray
Write-Host ""
