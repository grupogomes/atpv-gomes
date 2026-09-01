@echo off
REM ===========================================================================
REM  Liga o Relogio de Ponto. Clique duas vezes.
REM  Mantenha esta janela aberta enquanto o sistema estiver em uso.
REM ===========================================================================

title Relogio de Ponto - EM FUNCIONAMENTO
cd /d "%~dp0"

REM --- acha o node.exe -----------------------------------------------------
REM  Nao mexemos no PATH. Usamos, em ordem: o node embutido no pacote, o
REM  caminho que o INSTALAR.bat anotou, o PATH da maquina, e por fim as
REM  pastas onde o Node.js costuma ser instalado.
set "NODEEXE="
if exist "%~dp0node.exe" set "NODEEXE=%~dp0node.exe"
if not defined NODEEXE if exist "%~dp0node-encontrado.txt" (
    for /f "usebackq delims=" %%c in ("%~dp0node-encontrado.txt") do if exist "%%c" set "NODEEXE=%%c"
)
if not defined NODEEXE for /f "delims=" %%p in ('where node 2^>nul') do if not defined NODEEXE set "NODEEXE=%%p"
if not defined NODEEXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODEEXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODEEXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODEEXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODEEXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODEEXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

if not defined NODEEXE (
    echo.
    echo   O Node.js nao foi encontrado nesta maquina.
    echo   Clique duas vezes em INSTALAR.bat primeiro.
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo.
    echo   O sistema ainda nao foi instalado.
    echo   Clique duas vezes em INSTALAR.bat primeiro.
    echo.
    pause
    exit /b 1
)

if not exist .env (
    echo.
    echo   O sistema ainda nao foi configurado.
    echo   Clique duas vezes em INSTALAR.bat primeiro.
    echo.
    pause
    exit /b 1
)

cls
echo.
echo   ============================================================
echo      RELOGIO DE PONTO - EM FUNCIONAMENTO
echo   ============================================================
echo.
echo   NAO FECHE ESTA JANELA enquanto o sistema estiver sendo usado.
echo.
echo   Terminal de ponto ..  http://localhost:3000/kiosk/
echo   Administracao .....   http://localhost:3000/admin/
echo.
echo   Para desligar: feche esta janela ou aperte Ctrl+C.
echo.
echo   ------------------------------------------------------------
echo.

REM --- agente do leitor biometrico -----------------------------------------
REM  O leitor nao fala com o servidor direto: quem conversa com ele e o
REM  agente-nitgen.exe, que so existe depois de compilado. Sem o agente no
REM  ar, o sistema fica em modo de teste mesmo com o leitor plugado.
set "AGENTE=%~dp0agente-biometrico\nitgen\agente-nitgen.exe"
if exist "%AGENTE%" (
    tasklist /fi "imagename eq agente-nitgen.exe" 2>nul | find /i "agente-nitgen.exe" >nul
    if errorlevel 1 (
        echo   Ligando o agente do leitor biometrico...
        start "Agente biometrico" /min "%AGENTE%"
    ) else (
        echo   Agente do leitor biometrico ja estava ligado.
    )
) else (
    echo   Agente do leitor ainda nao compilado - o sistema roda em modo de teste.
)
echo.

start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000/kiosk/"

"%NODEEXE%" "%~dp0src\index.js"

echo.
echo   O sistema foi encerrado.
pause
