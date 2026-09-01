<#
    Prepara esta maquina para ser consultada pela rede local.

    Serve para voce abrir o painel de administracao de OUTRO computador do
    escritorio e acompanhar o ponto sem sair da sua mesa.

    NAO libera a marcacao de ponto de fora: a lista de redes autorizadas
    continua como esta. Bater ponto segue restrito a esta maquina, que e
    onde o leitor esta espetado.
#>

$ErrorActionPreference = 'SilentlyContinue'

function Titulo($t) { Write-Host ""; Write-Host "  $t" -ForegroundColor White; Write-Host "  $('-' * $t.Length)" -ForegroundColor DarkGray }
function Ok($t)     { Write-Host "  [ok]  $t" -ForegroundColor Green }
function Nao($t)    { Write-Host "  [nao] $t" -ForegroundColor Yellow }
function Info($t)   { Write-Host "        $t" -ForegroundColor DarkGray }

$raiz = $PSScriptRoot
if (-not $raiz) { $raiz = $env:PASTA_RELOGIO }
if (-not $raiz) { $raiz = (Get-Location).Path }
$raiz = $raiz.TrimEnd('\')

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor White
Write-Host "     ACESSO PELA REDE - PAINEL DE ADMINISTRACAO" -ForegroundColor White
Write-Host "  ============================================================" -ForegroundColor White

# ---------------------------------------------------------------------------
Titulo "1. Em que porta o sistema esta"

$porta = 3000
$env_arq = Join-Path $raiz '.env'
if (Test-Path $env_arq) {
    foreach ($linha in Get-Content $env_arq) {
        if ($linha -match '^\s*PORTA\s*=\s*([0-9]+)') { $porta = [int]$Matches[1] }
    }
    Ok "porta $porta (lida do .env)"
} else {
    Nao "nao achei o .env nesta pasta - assumindo a porta $porta"
    Info $raiz
}

$escutando = Get-NetTCPConnection -LocalPort $porta -State Listen
if ($escutando) { Ok "o sistema esta no ar nesta porta" }
else { Nao "nada escutando na porta $porta - ligue o sistema (INICIAR.bat) e rode de novo" }

# ---------------------------------------------------------------------------
Titulo "2. Liberar a porta no Firewall do Windows"

$nomeRegra = "Relogio de Ponto ($porta)"
$regra = Get-NetFirewallRule -DisplayName $nomeRegra
if ($regra) {
    Ok "a regra do firewall ja existe"
} else {
    try {
        New-NetFirewallRule -DisplayName $nomeRegra -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $porta -Profile Private,Domain | Out-Null
        Ok "regra criada: entrada TCP $porta liberada nas redes Privada e de Dominio"
        Info "Rede publica fica de fora de proposito - e o perfil que o Windows"
        Info "usa em wi-fi de aeroporto, cafe e afins."
    } catch {
        Nao "nao consegui criar a regra: $($_.Exception.Message)"
        Info "Rode este arquivo com o botao direito > Executar como administrador."
    }
}

# ---------------------------------------------------------------------------
Titulo "3. Enderecos para digitar no outro computador"

$enderecos = Get-NetIPAddress -AddressFamily IPv4 |
             Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
             Sort-Object IPAddress -Unique

if ($enderecos) {
    foreach ($e in $enderecos) {
        Write-Host ""
        Write-Host "    http://$($e.IPAddress):$porta/admin/" -ForegroundColor Cyan
        Info "pela placa: $($e.InterfaceAlias)"
    }
    Write-Host ""
    Info "Se houver mais de um endereco, tente o primeiro. Nao funcionando,"
    Info "tente o proximo: sao placas de rede diferentes desta maquina."
} else {
    Nao "esta maquina nao tem endereco de rede local no momento."
    Info "Confira se o cabo esta ligado ou se o wi-fi esta conectado."
}

# ---------------------------------------------------------------------------
Titulo "O que isso libera, e o que NAO libera"

Write-Host "  LIBERA   ver o painel /admin/ de outro computador do escritorio:" -ForegroundColor White
Write-Host "           pessoas, espelho de ponto, atestados, arquivos fiscais." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  NAO LIBERA  bater ponto de outra maquina. Duas barreiras seguem" -ForegroundColor White
Write-Host "              de pe: a lista de redes autorizadas no .env, que nao" -ForegroundColor DarkGray
Write-Host "              foi tocada aqui, e o leitor, que esta espetado nesta" -ForegroundColor DarkGray
Write-Host "              maquina e em nenhuma outra." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  ATENCAO  dentro da rede local a senha trafega sem criptografia." -ForegroundColor Yellow
Write-Host "           Numa rede de escritorio isso e aceitavel. Para acesso" -ForegroundColor DarkGray
Write-Host "           de fora da empresa, nao use isto: pede HTTPS." -ForegroundColor DarkGray
Write-Host ""
