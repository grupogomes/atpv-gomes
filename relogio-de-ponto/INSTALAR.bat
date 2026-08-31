@echo off
REM ===========================================================================
REM  Instalador do Relogio de Ponto - clique duas vezes neste arquivo.
REM
REM  As mensagens deste arquivo sao escritas SEM ACENTO de proposito: o console
REM  do Windows troca a tabela de caracteres conforme o idioma e a configuracao
REM  da maquina, e acento vira lixo na tela em boa parte dos casos. O sistema
REM  em si (telas, comprovantes, relatorios) usa acentuacao normal.
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
echo   Isto vai levar alguns minutos. Nao feche esta janela.
echo.
timeout /t 3 /nobreak >nul

REM ===========================================================================
echo   [1/4] Verificando o Node.js...
REM ===========================================================================

call :atualizar_path

where node >nul 2>&1
if %errorlevel% neq 0 goto instalar_node

for /f "tokens=1 delims=." %%v in ('node --version') do set "NODEMAJOR=%%v"
set "NODEMAJOR=!NODEMAJOR:v=!"

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
echo   [2/4] Baixando os componentes do sistema...
echo         (isso leva um ou dois minutos)
REM ===========================================================================

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

call npm run seed

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
echo       Se apareceu a mensagem "No prebuilt binaries found" no texto acima,
echo       o problema e a versao do Node. Rode este comando e tente de novo:
echo.
echo         winget install OpenJS.NodeJS --version 22.20.0
echo.
echo       Se nao apareceu, verifique a conexao com a internet.
echo.
echo       Mande o texto acima para o suporte.
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
