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

REM ===========================================================================
echo   [1/4] Verificando o Node.js...
REM ===========================================================================

call :achar_node
if not defined NODEEXE goto instalar_node

call :versao_node
if "!NODEOK!"=="0" (
    echo         Encontrado !NODEEXE!
    echo         Versao "!NODEVER!" - nao serve.
    goto instalar_node
)
echo         Node !NODEVER! encontrado. OK.
echo         ^(em !NODEEXE!^)
goto dependencias

:instalar_node
echo         Procurando um instalador do Node.js...
set "WINGET="
if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe" set "WINGET=%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe"
if not defined WINGET for /f "delims=" %%w in ('where winget 2^>nul') do if not defined WINGET set "WINGET=%%w"
if not defined WINGET goto sem_winget

echo         Instalando o Node.js. Isso leva alguns minutos...
"!WINGET!" install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements --silent
call :achar_node
if not defined NODEEXE goto sem_winget
call :versao_node
if "!NODEOK!"=="0" goto node_antigo
echo         Node !NODEVER! instalado. OK.
goto dependencias

:sem_winget
echo.
echo   [X] Nao foi possivel instalar o Node.js automaticamente.
echo.
echo       1^) Abra  https://nodejs.org
echo       2^) Baixe o botao verde da esquerda ^(LTS^) e instale, avancando
echo          em tudo sem mudar nada.
echo       3^) FECHE esta janela e clique de novo em INSTALAR.bat
echo.
echo       Se voce JA instalou o Node.js e mesmo assim chegou aqui, mande
echo       esta tela para o suporte: e um problema nosso, nao seu.
echo.
pause
exit /b 1

:node_antigo
echo.
echo   [X] O Node.js desta maquina e a versao "!NODEVER!".
echo       O sistema precisa da versao 22.5 ou superior, que traz o
echo       banco de dados embutido.
echo.
echo       Baixe a versao LTS em:  https://nodejs.org
echo       Instale por cima da atual e clique de novo em INSTALAR.bat
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
call :achar_npm
if not defined NPMCMD goto erro_dependencias
call "!NPMCMD!" install --omit=dev --no-audit --no-fund --loglevel=error
if !errorlevel! neq 0 (
    echo         Primeira tentativa falhou. Limpando e tentando de novo...
    if exist node_modules rmdir /s /q node_modules >nul 2>&1
    if exist package-lock.json del /q package-lock.json >nul 2>&1
    call "!NPMCMD!" install --omit=dev --no-audit --no-fund --loglevel=error
    if !errorlevel! neq 0 goto erro_dependencias
)
echo         Componentes instalados. OK.

REM ===========================================================================
:configurar
echo.
echo   [3/4] Configurando o sistema...
echo.
REM ===========================================================================

set "NODE_EXE_PARA_PS=!NODEEXE!"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
if !errorlevel! neq 0 goto erro_config

REM ===========================================================================
echo.
echo   [4/4] Criando o seu acesso...
echo.
REM ===========================================================================

"!NODEEXE!" "%~dp0src\db\seed.js"
if !errorlevel! neq 0 goto erro_seed

REM --- grava o caminho do node para o INICIAR.bat nao ter que procurar ------
> "%~dp0node-encontrado.txt" echo !NODEEXE!

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
echo   [X] Nao foi possivel preparar os componentes.
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

:erro_seed
echo.
echo   [X] Nao foi possivel criar o usuario administrador.
echo       Mande o texto acima para o suporte.
echo.
pause
exit /b 1

REM ===========================================================================
REM  Procura o node.exe. NAO mexe no PATH: a versao anterior deste arquivo
REM  reescrevia o PATH com o texto cru do registro (que vem com %SystemRoot%
REM  sem traduzir) e a partir dali o Windows nao achava mais programa nenhum,
REM  nem o node, nem o winget. Aqui a gente so PROCURA, em ordem:
REM    1. o PATH que a maquina ja tem
REM    2. o registro do proprio instalador do Node.js
REM    3. as pastas onde o Node.js costuma ser instalado
REM ===========================================================================
:achar_node
set "NODEEXE="

for /f "delims=" %%p in ('where node 2^>nul') do if not defined NODEEXE if exist "%%p" set "NODEEXE=%%p"

if not defined NODEEXE call :node_do_registro "HKLM\SOFTWARE\Node.js"
if not defined NODEEXE call :node_do_registro "HKLM\SOFTWARE\WOW6432Node\Node.js"

if not defined NODEEXE call :node_da_pasta "%ProgramFiles%\nodejs"
if not defined NODEEXE call :node_da_pasta "%ProgramFiles(x86)%\nodejs"
if not defined NODEEXE call :node_da_pasta "%ProgramW6432%\nodejs"
if not defined NODEEXE call :node_da_pasta "%LOCALAPPDATA%\Programs\nodejs"
if not defined NODEEXE call :node_da_pasta "%LOCALAPPDATA%\Programs\node"
if not defined NODEEXE call :node_da_pasta "%APPDATA%\npm"
if not defined NODEEXE call :node_da_pasta "%SystemDrive%\nodejs"
if not defined NODEEXE call :node_da_pasta "%ProgramData%\chocolatey\bin"

REM --- nvm-windows: pega a versao que estiver ativa -------------------------
if not defined NODEEXE if defined NVM_SYMLINK call :node_da_pasta "%NVM_SYMLINK%"
if not defined NODEEXE if defined NVM_HOME for /d %%d in ("%NVM_HOME%\v*") do call :node_da_pasta "%%~d"

exit /b 0

:node_da_pasta
if exist "%~1\node.exe" set "NODEEXE=%~1\node.exe"
exit /b 0

:node_do_registro
for /f "tokens=2,*" %%a in ('reg query "%~1" /v InstallPath 2^>nul ^| find "REG_"') do (
    set "PASTAREG=%%b"
    if exist "!PASTAREG!node.exe" set "NODEEXE=!PASTAREG!node.exe"
    if exist "!PASTAREG!\node.exe" set "NODEEXE=!PASTAREG!\node.exe"
)
exit /b 0

REM ===========================================================================
REM  Procura o npm.cmd. Ele mora na mesma pasta do node.exe.
REM  So e usado se o pacote vier sem a pasta node_modules.
REM ===========================================================================
:achar_npm
set "NPMCMD="
for %%d in ("!NODEEXE!") do set "PASTANODE=%%~dpd"
if exist "!PASTANODE!npm.cmd" set "NPMCMD=!PASTANODE!npm.cmd"
if not defined NPMCMD for /f "delims=" %%p in ('where npm 2^>nul') do if not defined NPMCMD set "NPMCMD=%%p"
exit /b 0

REM ===========================================================================
REM  Le a versao do Node e diz se serve. Precisamos de 22.5 ou superior, que
REM  e quando o Node passou a trazer o SQLite embutido.
REM ===========================================================================
:versao_node
set "NODEOK=0"
set "NODEVER="
set "NODEMAIOR=0"
set "NODEMENOR=0"

REM  Rodamos o node numa linha propria, e nao dentro de um for /f, porque o
REM  caminho tem espaco ("C:\Program Files\nodejs") e as aspas se perdem
REM  quando o for /f monta o comando. Gravar num arquivo e reler e chato,
REM  mas nao tem esse problema.
set "ARQVER=%TEMP%\rdp-versao-node.txt"
if exist "!ARQVER!" del /q "!ARQVER!" >nul 2>&1
"!NODEEXE!" --version > "!ARQVER!" 2>nul
if not exist "!ARQVER!" exit /b 0
set /p NODEVER=<"!ARQVER!"
del /q "!ARQVER!" >nul 2>&1

REM  Sem um "v" na frente, o que voltou nao e uma versao do Node.
if "!NODEVER!"=="" exit /b 0
if not "!NODEVER:~0,1!"=="v" exit /b 0

for /f "tokens=1,2 delims=." %%a in ("!NODEVER!") do (
    set "NODEMAIOR=%%a"
    set "NODEMENOR=%%b"
)
set "NODEMAIOR=!NODEMAIOR:v=!"
if "!NODEMAIOR!"=="" set "NODEMAIOR=0"
if "!NODEMENOR!"=="" set "NODEMENOR=0"
if !NODEMAIOR! gtr 22 set "NODEOK=1"
if !NODEMAIOR! equ 22 if !NODEMENOR! geq 5 set "NODEOK=1"
exit /b 0
