<#
    Desliga o Relogio de Ponto que esta rodando escondido.

    Encerra apenas o node.exe que esta rodando o src\index.js DESTA pasta.
    Outro programa em Node na mesma maquina nao e tocado.
#>

$ErrorActionPreference = 'SilentlyContinue'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  Procurando o Relogio de Ponto desta pasta..." -ForegroundColor White
Write-Host "  $raiz" -ForegroundColor DarkGray
Write-Host ""

$processos = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
             Where-Object {
                 $_.CommandLine -and
                 $_.CommandLine.Contains('src\index.js') -and
                 $_.CommandLine.Contains($raiz)
             }

if ($processos) {
    foreach ($p in $processos) {
        Stop-Process -Id $p.ProcessId -Force
        Write-Host "  [ok] desligado (processo $($p.ProcessId))" -ForegroundColor Green
    }
} else {
    Write-Host "  [!]  Nao estava rodando." -ForegroundColor Yellow
}

# A tarefa agendada sobe o sistema de novo ao ligar o PC. Se ela existir,
# avisamos - senao a pessoa desliga e ele "volta sozinho" sem explicacao.
$tarefa = Get-ScheduledTask -TaskName 'RelogioDePonto'
if ($tarefa) {
    Write-Host ""
    Write-Host "  Atencao: existe a tarefa 'RelogioDePonto', que sobe o sistema" -ForegroundColor Yellow
    Write-Host "  sozinho ao ligar o computador. Situacao agora: $($tarefa.State)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    parar so por enquanto:  Stop-ScheduledTask -TaskName RelogioDePonto" -ForegroundColor DarkGray
    Write-Host "    nao subir mais:         Disable-ScheduledTask -TaskName RelogioDePonto" -ForegroundColor DarkGray
    Write-Host "    voltar a subir:         Enable-ScheduledTask -TaskName RelogioDePonto" -ForegroundColor DarkGray
}

Write-Host ""
