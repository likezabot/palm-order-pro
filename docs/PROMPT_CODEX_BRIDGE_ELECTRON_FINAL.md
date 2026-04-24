# Plano B Fast Order — Bridge Electron .exe (instalador único Windows)

## Contexto
Já existe um app PDV web em https://palm-order-pro.lovable.app que envia ESC/POS para `http://localhost:9100/print`. Sua tarefa é criar UM ÚNICO instalador Windows que sobe a bridge HTTP + abre o app + fica na bandeja, sem console preto.

## Estrutura do projeto

Crie pasta `desktop/` com:

```
desktop/
├── package.json
├── main.cjs              ← processo principal Electron
├── preload.cjs           ← contexto isolado
├── bridge/
│   ├── server.cjs        ← Express na porta 9100
│   ├── printer.cjs       ← lógica spooler-powershell
│   └── config.cjs        ← load/save em %APPDATA%/plano-b-bridge/
├── assets/
│   ├── tray-icon.png     ← 256x256 fundo transparente
│   └── installer-icon.ico
└── build/
    └── installer.nsh
```

## package.json

```json
{
  "name": "planob-fast-order",
  "version": "2.2.0",
  "main": "main.cjs",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win --x64"
  },
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.13.0"
  },
  "build": {
    "appId": "com.planob.fastorder",
    "productName": "Plano B Fast Order",
    "win": {
      "target": "nsis",
      "icon": "assets/installer-icon.ico",
      "requestedExecutionLevel": "asInvoker"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "shortcutName": "Plano B Fast Order",
      "include": "build/installer.nsh"
    },
    "extraResources": ["bridge/**/*", "assets/**/*"]
  }
}
```

## main.cjs (essencial)

- `app.whenReady()`:
  1. `require('./bridge/server.cjs').start({ port: 9100, host: '0.0.0.0' })`
  2. Cria `BrowserWindow` 1366x800, `frame: true`, `autoHideMenuBar: true`, carrega `https://palm-order-pro.lovable.app/admin`.
  3. Cria `Tray` com menu: "Abrir Painel", "Status: <printer>", "Reiniciar Bridge", "Abrir Logs", separador, "Iniciar com Windows" (checkbox), "Sair".
- `window.on('close', e => { e.preventDefault(); win.hide(); })` — só sai pelo menu tray > Sair.
- `app.setLoginItemSettings({ openAtLogin: <persistido> })`.
- A cada 30s, ping interno em `http://localhost:9100/health`, atualiza label do menu.
- `app.requestSingleInstanceLock()` — segunda execução só foca a janela.

## bridge/server.cjs — endpoints obrigatórios

Express com cors aberto. Exporta `start({port, host})`. Endpoints:

### GET /health
Cache 5s em memória (NUNCA chama PowerShell síncrono — isso causava timeout 1.5s).
```json
{
  "ok": true,
  "bridge_version": "2.2.0",
  "printer_ok": true,
  "printer_ready": true,
  "printer_name": "POS80_MeuSistema",
  "printer_method": "spooler-powershell",
  "uptime_s": 1234
}
```

### GET /printers
Lista impressoras via `wmic printer get name` ou `Get-Printer | Select Name`.

### GET /config + POST /config
Lê/grava `%APPDATA%/plano-b-bridge/config.json` com `{ printerName, paperWidth }`.

### POST /test
Imprime "TESTE OK\n\n\n" + corte ESC/POS.

### POST /print
Body: `{ payload: "<base64 ESC/POS>", format: "escpos", source, timestamp }`.
1. Decodifica base64 → buffer.
2. Escreve em arquivo temp `%TEMP%/plano-b-print-<uuid>.bin`.
3. Roda PowerShell: `Get-Content -Raw -Encoding Byte | Out-Printer -Name <printerName>`.
4. Apaga temp. Retorna `{ success: true, ms: 1063 }`.

Logs em `%APPDATA%/plano-b-bridge/logs/bridge-YYYY-MM-DD.log` com rotação.

## bridge/printer.cjs

```javascript
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function printRaw(buffer, printerName) {
  const tempFile = path.join(os.tmpdir(), `plano-b-${Date.now()}.bin`);
  fs.writeFileSync(tempFile, buffer);
  
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Get-Content -Raw -Path "${tempFile}" -Encoding Byte | Out-Printer -Name "${printerName}"`
    ], { windowsHide: true });
    
    let stderr = '';
    ps.stderr.on('data', d => stderr += d);
    ps.on('close', code => {
      try { fs.unlinkSync(tempFile); } catch {}
      if (code === 0) resolve();
      else reject(new Error(stderr || `powershell exit ${code}`));
    });
  });
}

module.exports = { printRaw };
```

## build/installer.nsh — abrir firewall automaticamente

```nsis
!macro customInstall
  ExecWait 'netsh advfirewall firewall delete rule name="Plano B Bridge"'
  ExecWait 'netsh advfirewall firewall add rule name="Plano B Bridge" dir=in action=allow protocol=TCP localport=9100'
!macroend

!macro customUnInstall
  ExecWait 'netsh advfirewall firewall delete rule name="Plano B Bridge"'
!macroend
```

## Build

```bash
cd desktop
npm install
npm run build
# saída: desktop/dist/Plano B Fast Order Setup 2.2.0.exe
```

## Critério de aceite

- [ ] Instalador `.exe` de ~80MB, instala com 2 cliques.
- [ ] Cria atalho na área de trabalho + menu iniciar.
- [ ] Abre janela do app + ícone na bandeja.
- [ ] **Zero console preto** em qualquer momento.
- [ ] Botão direito na bandeja → menu funcional, mostra impressora atual.
- [ ] Fechar janela X → vai pra bandeja, bridge continua viva.
- [ ] Abrir https://palm-order-pro.lovable.app/admin > Sistema > Diagnóstico mostra "PONTE ONLINE v2.2.0".
- [ ] Health → Mínimo → Cupom imprimem sem erro.
- [ ] Reinstalar não duplica regra de firewall.
- [ ] "Iniciar com Windows" funciona após reboot.

## NÃO MEXER

- Em código React do palm-order-pro (já está configurado pra falar com `localhost:9100`).
- Em Supabase / Lovable Cloud.
- Em endpoints já documentados (mantenha mesma assinatura).
