@echo off
REM ===========================================================================
REM  Olha o que ja existe nesta maquina para o leitor biometrico NITGEN.
REM  So consulta: nao instala nem altera nada. Clique duas vezes.
REM ===========================================================================

title Verificacao do leitor biometrico
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agente-biometrico\nitgen\verificar-leitor.ps1"

echo.
pause
