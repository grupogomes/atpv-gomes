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
    foreach ($d in $dispositivos) {
        $temLeitor = $true
        if ($d.Status -eq 'OK') { Ok "$($d.FriendlyName)" }
        else { Nao "$($d.FriendlyName) - situacao: $($d.Status)" }
    }
} else {
    Nao "Nenhum leitor biometrico encontrado."
    Info "Plugue o leitor numa porta USB e rode de novo."
}

# ---------------------------------------------------------------------------
Titulo "2. O SDK da NITGEN esta instalado?"

$lugares = @(
    (Join-Path $aqui 'NITGEN.SDK.NBioBSP.dll'),
    (Join-Path $aqui 'agente-biometrico\nitgen\NITGEN.SDK.NBioBSP.dll'),
    "$env:ProgramFiles\NITGEN\eNBSP SDK\Bin\NITGEN.SDK.NBioBSP.dll",
    "${env:ProgramFiles(x86)}\NITGEN\eNBSP SDK\Bin\NITGEN.SDK.NBioBSP.dll",
    "$env:WINDIR\System32\NITGEN.SDK.NBioBSP.dll",
    "$env:WINDIR\SysWOW64\NITGEN.SDK.NBioBSP.dll"
)
$dll = $lugares | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $dll) {
    Info "Nao estava nos lugares de sempre. Procurando no disco C:..."
    Info "(pode levar um ou dois minutos)"
    $dll = Get-ChildItem C:\ -Filter 'NITGEN.SDK.NBioBSP.dll' -Recurse |
           Select-Object -First 1 -ExpandProperty FullName
}

if ($dll) {
    $temSdk = $true
    Ok "NITGEN.SDK.NBioBSP.dll encontrada"
    Info $dll
    $v = (Get-Item $dll).VersionInfo.FileVersion
    if ($v) { Info "versao do arquivo: $v" }

    $nativa = Join-Path (Split-Path $dll) 'NBioBSP.dll'
    if (Test-Path $nativa) { $temNativa = $true; Ok "NBioBSP.dll (nativa) ao lado" }
    else {
        $nativa2 = Get-ChildItem C:\ -Filter 'NBioBSP.dll' -Recurse | Select-Object -First 1
        if ($nativa2) { $temNativa = $true; Ok "NBioBSP.dll (nativa) em $($nativa2.FullName)" }
        else { Nao "NBioBSP.dll (nativa) nao encontrada" }
    }
} else {
    Nao "SDK da NITGEN nao encontrado nesta maquina."
    Info "Baixe em: http://www.nitgen.com.br/download/eNBSP_SDK_v4.85.zip"
}

# ---------------------------------------------------------------------------
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

$net35 = $null
try { $net35 = Get-WindowsOptionalFeature -Online -FeatureName NetFx3 } catch { }
if ($net35 -and $net35.State -eq 'Enabled') { Ok ".NET Framework 3.5 ligado" }
elseif ($net35) { Nao ".NET Framework 3.5 desligado - o SDK precisa dele em Windows 64 bits"; Info "Ligue com:  Enable-WindowsOptionalFeature -Online -FeatureName NetFx3 -All" }
else { Info "Nao foi possivel consultar o .NET 3.5 (rode como administrador para saber)." }

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
