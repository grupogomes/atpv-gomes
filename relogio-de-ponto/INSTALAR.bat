@echo off
REM ===========================================================================
REM  Instalador do Relogio de Ponto - clique duas vezes neste arquivo.
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

call :atualizar_path
where node >nul 2>&1
if %errorlevel% neq 0 goto instalar_node

call :versao_node
if "!NODEOK!"=="0" (
    echo         Node !NODEMAIOR!.!NODEMENOR! e antigo demais. Instalando o Node 22...
    goto instalar_node
)
for /f %%v in ('node --version') do echo         Node %%v encontrado. OK.
goto dependencias

:instalar_node
echo         Instalando o Node.js...
where winget >nul 2>&1
if %errorlevel% neq 0 goto sem_winget
winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
call :atualizar_path
where node >nul 2>&1
if %errorlevel% neq 0 goto sem_winget
call :versao_node
if "!NODEOK!"=="0" goto node_antigo
echo         Node.js instalado.
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

:node_antigo
echo.
echo   [X] O Node.js instalado e antigo demais. O sistema precisa da
echo       versao 22.5 ou superior, que traz o banco de dados embutido.
echo.
echo       Baixe a versao LTS em:  https://nodejs.org
echo.
pause
exit /b 1

REM ===========================================================================
:dependencias
echo.
echo   [2/4] Componentes do sistema...
REM ===========================================================================

if exist node_modules (
    echo         Ja vem prontos neste pacote. OK.
    goto configurar
)

echo         Baixando... ^(leva menos de um minuto^)
call npm install --omit=dev --no-audit --no-fund --loglevel=error
if %errorlevel% neq 0 (
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
echo       Verifique a conexao com a internet e tente de novo.
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
REM  Le a versao do Node e diz se serve. Precisamos de 22.5 ou superior, que
REM  e quando o Node passou a trazer o SQLite embutido.
REM ===========================================================================
:versao_node
set "NODEOK=0"
for /f "tokens=1,2 delims=." %%a in ('node --version') do (
    set "NODEMAIOR=%%a"
    set "NODEMENOR=%%b"
)
set "NODEMAIOR=!NODEMAIOR:v=!"
if !NODEMAIOR! gtr 22 set "NODEOK=1"
if !NODEMAIOR! equ 22 if !NODEMENOR! geq 5 set "NODEOK=1"
exit /b 0

REM ===========================================================================
REM  Recarrega o PATH do registro. Necessario porque um programa recem
REM  instalado so aparece no PATH de janelas ABERTAS DEPOIS dele.
REM ===========================================================================
:atualizar_path
for /f "tokens=2,*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| find "REG_"') do set "PATHSIS=%%b"
for /f "tokens=2,*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul ^| find "REG_"') do set "PATHUSU=%%b"
set "PATH=%PATHSIS%;%PATHUSU%"
exit /b 0
