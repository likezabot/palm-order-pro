@echo off
TITLE Ponte de Impressao - Plano B
echo Verificando dependencias...

IF NOT EXIST node_modules (
    echo Instalando dependencias (escpos, express, cors)...
    call npm install express cors escpos escpos-usb
)

echo Iniciando a Ponte Local na porta 9100...
node lp-bridge.js

pause
