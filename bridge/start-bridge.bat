@echo off
TITLE Ponte de Impressao - Plano B Espetaria
color 0A

echo =========================================
echo    PONTE DE IMPRESSAO TERMICA
echo    Plano B Espetaria
echo =========================================
echo.

IF NOT EXIST node_modules (
    echo Instalando dependencias...
    call npm install express cors
    echo.
)

echo Iniciando bridge na porta 3001...
echo Impressora: POS80 Printer
echo.
echo Para testar, abra no navegador:
echo http://localhost:3001/health
echo http://localhost:3001/test
echo.

node lp-bridge.js

pause
