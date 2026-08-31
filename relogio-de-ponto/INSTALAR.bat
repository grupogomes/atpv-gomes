@echo off
REM ===========================================================================
REM  Instalador do Relogio de Ponto - clique duas vezes neste arquivo.
REM
REM  Funciona de dois jeitos:
REM   - PACOTE FECHADO: se existir um node.exe nesta pasta, usa ele. Nao baixa
REM     nada, nao instala nada, funciona sem internet.
REM   - PROJETO: sem node.exe, instala o Node e baixa as dependencias.
REM
REM  As mensagens sao escritas SEM ACENTO de proposito: o console do Windows
REM  troca a tabela de caracteres conforme a maquina e acento vira lixo na tela.
REM ===========================================================================

title Instalador do Relogio de Ponto
setlocal EnableExtensions EnableDelayedExpansion

REM --- pede permissao de administrador, se ainda nao tiver -------------------
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Pedindo permissao de administrador...
    echo  Clique em SIM na janela que vai aparecer.
    echo.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>&1
    exit /b
)

cd /d "%~dp0"

cls
echo.
echo   ============================================================
echo      RELOGIO DE PONTO - INSTALACAO
echo   ============================================================
echo.
echo   Pasta: %CD%
echo.
timeout /t 2 /nobreak >nul

REM ===========================================================================
echo   [1/4] Verificando o Node.js...
REM ===========================================================================

set "NODEEXE=node"
set "OFFLINE=0"
if exist "%~dp0binarios" set "OFFLINE=1"
call :atualizar_path

where node >nul 2>&1
if %errorlevel% neq 0 goto instalar_node

for /f "tokens=1 delims=." %%v in ('node --version') do set "NODEMAJOR=%%v"
set "NODEMAJOR=!NODEMAJOR:v=!"

if "!OFFLINE!"=="1" (
    REM Pacote fechado: temos binario do banco para o Node 22 e para o 24.
    set "ABIDE="
    if "!NODEMAJOR!"=="22" set "ABIDE=127"
    if "!NODEMAJOR!"=="24" set "ABIDE=137"
    if "!ABIDE!"=="" (
        echo         Node !NODEMAJOR! nao acompanha este pacote. Instalando o Node 22...
        goto instalar_node22
    )
    for /f %%v in ('node --version') do echo         Node %%v encontrado. OK.
    goto dependencias
)

REM Versoes para as quais o better-sqlite3 publica binario pronto. Fora dessa
REM faixa o npm tenta compilar da fonte e exige Python e compilador C++.
set "OK=0"
for %%n in (20 22 23 24 25 26) do if "!NODEMAJOR!"=="%%n" set "OK=1"
if "!OK!"=="0" (
    echo         Node !NODEMAJOR! nao tem binario pronto. Instalando o Node 22...
    goto instalar_node22
)

for /f %%v in ('node --version') do echo         Node %%v encontrado. OK.
goto dependencias

:instalar_node
echo         Node.js nao encontrado. Instalando...
where winget >nul 2>&1
if %errorlevel% neq 0 goto sem_winget
if "!OFFLINE!"=="1" goto instalar_node22
winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
call :atualizar_path
where node >nul 2>&1
if %errorlevel% neq 0 goto sem_winget
echo         Node.js instalado.
goto dependencias

:instalar_node22
where winget >nul 2>&1
if %errorlevel% neq 0 goto sem_winget
winget install --id OpenJS.NodeJS --version 22.20.0 --accept-source-agreements --accept-package-agreements --silent
call :atualizar_path
if "!OFFLINE!"=="1" set "ABIDE=127"
goto dependencias

:sem_winget
echo.
echo   [X] Nao foi possivel instalar o Node.js automaticamente.
echo.
echo       Baixe e instale a versao LTS em:  https://nodejs.org
echo       Depois FECHE esta janela e clique de novo em INSTALAR.bat
echo.
pause
exit /b 1

REM ===========================================================================
:dependencias
echo.
echo   [2/4] Componentes do sistema...
REM ===========================================================================

if "!OFFLINE!"=="1" (
    echo         Ja vem prontos no pacote.
    echo         Instalando o banco de dados para o Node !NODEMAJOR!...
    copy /y "%~dp0binarios\better_sqlite3-abi!ABIDE!.node" ^
            "%~dp0node_modules\better-sqlite3\build\Release\better_sqlite3.node" >nul
    if errorlevel 1 goto erro_binario
    echo         OK.
    goto configurar
)

if exist node_modules (
    echo         Ja instalados. OK.
    goto configurar
)

echo         Baixando... ^(leva um ou dois minutos^)
call npm install --omit=dev --no-audit --no-fund --loglevel=error
if %errorlevel% neq 0 (
    echo.
    echo         Primeira tentativa falhou. Limpando e tentando de novo...
    if exist node_modules rmdir /s /q node_modules >nul 2>&1
    if exist package-lock.json del /q package-lock.json >nul 2>&1
    call npm install --omit=dev --no-audit --no-fund --loglevel=error
    if !errorlevel! neq 0 goto erro_dependencias
)
echo         Componentes instalados. OK.

REM ===========================================================================
:configurar
echo.
echo   [3/4] Configurando o sistema...
echo.
REM ===========================================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
if %errorlevel% neq 0 goto erro_config

REM ===========================================================================
echo.
echo   [4/4] Criando o seu acesso...
echo.
REM ===========================================================================

node "%~dp0src\db\seed.js"

echo.
echo   ============================================================
echo      PRONTO
echo   ============================================================
echo.
echo   Para usar o sistema, clique duas vezes em INICIAR.bat
echo.
echo   Enderecos (no navegador deste computador):
echo     Terminal de ponto ..  http://localhost:3000/kiosk/
echo     Administracao .....   http://localhost:3000/admin/
echo.
pause
exit /b 0

REM ===========================================================================
:erro_dependencias
echo.
echo   [X] Nao foi possivel baixar os componentes.
echo.
echo       Se apareceu "No prebuilt binaries found" no texto acima, o problema
echo       e a versao do Node - nao faltam ferramentas de compilacao. Rode:
echo.
echo         winget install OpenJS.NodeJS --version 22.20.0
echo.
echo       Feche esta janela, apague a pasta node_modules e comece de novo.
echo.
pause
exit /b 1

:erro_binario
echo.
echo   [X] Nao foi possivel instalar o banco de dados.
echo       Confira se a pasta node_modules veio junto no pacote.
echo.
pause
exit /b 1

:erro_config
echo.
echo   [X] A configuracao nao terminou. Veja a mensagem acima.
echo.
pause
exit /b 1

REM ===========================================================================
REM  Recarrega o PATH do registro. Necessario porque um programa recem
REM  instalado so aparece no PATH de janelas ABERTAS DEPOIS dele.
REM ===========================================================================
:atualizar_path
for /f "tokens=2,*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| find "REG_"') do set "PATHSIS=%%b"
for /f "tokens=2,*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul ^| find "REG_"') do set "PATHUSU=%%b"
set "PATH=%PATHSIS%;%PATHUSU%"
exit /b 0
