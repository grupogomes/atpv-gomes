@echo off
REM ===========================================================================
REM  Desliga o Relogio de Ponto que esta rodando escondido.
REM  Use quando tiver subido pelo INICIAR-SEM-JANELA.vbs.
REM ===========================================================================

title Desligar o Relogio de Ponto
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0parar.ps1"

pause
