@echo off
REM ===========================================================================
REM  Liga o Relogio de Ponto. Clique duas vezes.
REM  Mantenha esta janela aberta enquanto o sistema estiver em uso.
REM ===========================================================================

title Relogio de Ponto - EM FUNCIONAMENTO
cd /d "%~dp0"

if not exist node_modules (
    echo.
    echo   O sistema ainda nao foi instalado.
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

REM Abre o terminal de ponto no navegador padrao, depois de o servidor subir.
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000/kiosk/"

node src\index.js

echo.
echo   O sistema foi encerrado.
pause
