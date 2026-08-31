@echo off
REM ===========================================================================
REM  Liga o Relogio de Ponto. Clique duas vezes.
REM  Mantenha esta janela aberta enquanto o sistema estiver em uso.
REM ===========================================================================

title Relogio de Ponto - EM FUNCIONAMENTO
cd /d "%~dp0"

if exist "%~dp0node.exe" ( set "NODEEXE=%~dp0node.exe" ) else ( set "NODEEXE=node" )

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

start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000/kiosk/"

"%NODEEXE%" "%~dp0src\index.js"

echo.
echo   O sistema foi encerrado.
pause
