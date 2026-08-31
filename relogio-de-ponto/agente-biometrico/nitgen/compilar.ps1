<#
    Compila o agente biometrico NITGEN.

    Nao precisa de Visual Studio: o compilador C# (csc.exe) ja vem com o
    .NET Framework, que existe em qualquer Windows.
#>

$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $aqui

function Ok($t)    { Write-Host "  [ok] $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [!]  $t" -ForegroundColor Yellow }
function Erro($t)  { Write-Host "  [X]  $t" -ForegroundColor Red }

Write-Host ""
Write-Host "  Compilando o agente biometrico NITGEN" -ForegroundColor White
Write-Host ""

# --- compilador ------------------------------------------------------------
$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4.0.*\csc.exe" -ErrorAction SilentlyContinue |
       Select-Object -Last 1
if (-not $csc) {
    $csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework\v4.0.*\csc.exe" -ErrorAction SilentlyContinue |
           Select-Object -Last 1
}
if (-not $csc) {
    Erro "Compilador C# (csc.exe) nao encontrado."
    Write-Host "  Instale o .NET Framework 4.x pelo Windows Update."
    exit 1
}
Ok "compilador: $($csc.FullName)"

# --- DLL do SDK ------------------------------------------------------------
# Procura a NITGEN.SDK.NBioBSP.dll nos lugares onde o SDK costuma cair.
$candidatos = @(
    (Join-Path $aqui 'NITGEN.SDK.NBioBSP.dll'),
    "$env:ProgramFiles\NITGEN\eNBSP SDK\Bin\NITGEN.SDK.NBioBSP.dll",
    "${env:ProgramFiles(x86)}\NITGEN\eNBSP SDK\Bin\NITGEN.SDK.NBioBSP.dll",
    "$env:WINDIR\System32\NITGEN.SDK.NBioBSP.dll"
)
$dll = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $dll) {
    Write-Host "  Procurando no disco (pode levar um minuto)..." -ForegroundColor DarkGray
    $dll = Get-ChildItem C:\ -Filter 'NITGEN.SDK.NBioBSP.dll' -Recurse -ErrorAction SilentlyContinue |
           Select-Object -First 1 -ExpandProperty FullName
}

if (-not $dll) {
    Erro "NITGEN.SDK.NBioBSP.dll nao encontrada."
    Write-Host ""
    Write-Host "  Baixe e instale o eNBSP SDK da Nitgen:" -ForegroundColor White
    Write-Host "    http://www.nitgen.com.br/download/eNBSP_SDK_v4.85.zip" -ForegroundColor White
    Write-Host ""
    Write-Host "  Depois copie a NITGEN.SDK.NBioBSP.dll para esta pasta e rode de novo."
    exit 1
}
Ok "SDK: $dll"

Copy-Item $dll -Destination $aqui -Force -ErrorAction SilentlyContinue

# A DLL nativa precisa estar junto do executavel para o wrapper .NET achar.
$nativa = Join-Path (Split-Path $dll) 'NBioBSP.dll'
if (Test-Path $nativa) {
    Copy-Item $nativa -Destination $aqui -Force -ErrorAction SilentlyContinue
    Ok "NBioBSP.dll (nativa) copiada"
} else {
    Aviso "NBioBSP.dll (nativa) nao encontrada ao lado do wrapper."
    Write-Host "     Se o agente reclamar de DLL ausente, copie-a para esta pasta."
}

# --- compilacao ------------------------------------------------------------
$saida = Join-Path $aqui 'agente-nitgen.exe'
$argumentos = @(
    '/nologo',
    '/target:exe',
    "/out:$saida",
    '/reference:System.dll',
    '/reference:System.Web.Extensions.dll',
    "/reference:$(Join-Path $aqui 'NITGEN.SDK.NBioBSP.dll')",
    (Join-Path $aqui 'AgenteNitgen.cs')
)

& $csc.FullName $argumentos
if ($LASTEXITCODE -ne 0) {
    Erro "A compilacao falhou."
    Write-Host ""
    Write-Host "  Se o erro for sobre um metodo do SDK (Capture, VerifyMatch," -ForegroundColor White
    Write-Host "  OpenDevice), a assinatura mudou nesta versao. Os pontos a" -ForegroundColor White
    Write-Host "  ajustar estao marcados com '>>> CONFERIR' em AgenteNitgen.cs." -ForegroundColor White
    Write-Host "  Abra o Claude Code nesta pasta e peca para ele corrigir." -ForegroundColor White
    exit 1
}

Ok "gerado: $saida"
Write-Host ""
Write-Host "  Teste agora, com o leitor plugado:" -ForegroundColor White
Write-Host "    .\agente-nitgen.exe" -ForegroundColor Gray
Write-Host "  e, noutra janela:" -ForegroundColor White
Write-Host "    curl http://127.0.0.1:9010/status" -ForegroundColor Gray
Write-Host ""
Write-Host "  Funcionando, troque no .env do relogio de ponto:" -ForegroundColor White
Write-Host "    BIOMETRIA_DRIVER=agente" -ForegroundColor Gray
Write-Host ""
