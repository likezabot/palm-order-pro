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

echo Iniciando bridge na porta 9100...
echo Impressora: POS80 Printer
echo.
echo Para testar, abra no navegador:
echo http://localhost:9100/health
echo http://localhost:9100/test
echo.

node lp-bridge.js

pause
