# Prompt para Codex Desktop — Bridge v2.1 (Spooler do Windows)

> Cole este arquivo inteiro no Codex Desktop. Ele instrui a reescrita da camada de impressão da bridge local **sem usar libusb/WinUSB** (que exigiria Zadig e quebraria o app de entregas). A nova versão fala com a impressora pelo **Spooler do Windows**, mesmo caminho usado pelo app de entregas.

---

## Contexto

- Projeto: **Plano B Espetaria** — POS web (Lovable/React) + bridge local Node.js que imprime cupons em impressora térmica.
- Bridge atual: `bridge/lp-bridge.js` versão **2.0.0**, empacotada como `lp-bridge-v2.exe`.
- **Problema observado em produção (Windows 10/11):**
  ```
  ❌ Falha ao abrir USB: LIBUSB_ERROR_NOT_SUPPORTED
  ⚠️ Boot sem impressora pronta
  ```
- Causa: a v2 usa `escpos` + `escpos-usb`, que precisam do driver **WinUSB/libusb**. A impressora `POS80_MeuSistema` está instalada com o **driver nativo do Windows** (mesmo driver usado pelo app de entregas — iFood/Anota AI/etc.). Trocar para WinUSB com Zadig **quebraria** o app de entregas.
- Solução: **abandonar USB raw** e enviar o ESC/POS direto para a **fila de impressão do Windows** (Spooler), por nome de impressora.

## Ambiente alvo

- Windows 10/11 x64.
- Impressora térmica USB instalada como `POS80_MeuSistema` (visível em **Painel de Controle → Dispositivos e Impressoras**).
- Mesma impressora também usada por app de entregas (driver nativo, **NÃO MEXER**).
- Bridge roda como `.exe` standalone (via `pkg`), porta `3001`, IP `0.0.0.0`.

---

## Objetivo

Reescrever a camada de impressão da bridge para usar o **Spooler do Windows**, mantendo **100% de compatibilidade de API** com o site (mesmos endpoints, mesmo contrato de `POST /print`).

Versão alvo: **`2.1.0`**.

---

## Stack

**Remover:**
```
escpos
escpos-usb
```

**Adicionar (primário):**
```
@thiagoelg/node-printer  (envia buffer RAW para spooler de impressora nomeada)
```

**Manter:**
```
express
cors
winston            (logs rotativos — já existe na v2)
winston-daily-rotate-file
```

**Fallback (sem dependência nativa):** `child_process` chamando PowerShell. Usado **automaticamente** se o binding nativo de `node-printer` falhar no boot (típico em build `pkg`).

---

## Estrutura de arquivos

```
bridge/
  lp-bridge.js              ← entry Express (atualizar versão e endpoints novos)
  lib/
    printer.js              ← REESCREVER (spooler + fallback PowerShell)
    queue.js                ← MANTER (FIFO, 1 worker, igual v2)
    logger.js               ← MANTER (winston rotativo, igual v2)
    config-store.js         ← NOVO (lê/grava config.json ao lado do .exe)
  config.json               ← NOVO (criado no primeiro boot se não existir)
  package.json              ← atualizar deps + version
  start-bridge.bat          ← atualizar mensagens
  build.bat                 ← script pkg
```

`config.json` default:
```json
{
  "printer_name": "POS80_MeuSistema",
  "port": 3001
}
```

`config-store.js` deve resolver o caminho de `config.json` **ao lado do executável** (não dentro do snapshot do `pkg`):
```js
const path = require('path');
const exeDir = path.dirname(process.execPath);
const configPath = path.join(exeDir, 'config.json');
```

---

## Camada de impressão — `lib/printer.js`

Exporta:

```ts
type PrinterMethod = 'spooler-native' | 'spooler-powershell';

interface PrinterStatus {
  ok: boolean;
  name: string;
  method: PrinterMethod;
  status: 'IDLE' | 'PRINTING' | 'OFFLINE' | 'PAPER_OUT' | 'UNKNOWN';
  error?: string;
}

listPrinters(): Promise<string[]>            // nomes como aparecem no Painel do Windows
getStatus(name: string): Promise<PrinterStatus>
printRaw(name: string, buffer: Buffer): Promise<{ ok: true } | { ok: false, error: string }>
getMethod(): PrinterMethod                   // qual modo está ativo
```

### Modo primário: `@thiagoelg/node-printer`

```js
const printer = require('@thiagoelg/node-printer');

function listNative() {
  return printer.getPrinters().map(p => p.name);
}

function statusNative(name) {
  const info = printer.getPrinter(name); // { name, status: ['IDLE'|'PRINTING'|...], options... }
  // Mapear info.status[] -> enum acima
}

function printNative(name, buffer) {
  return new Promise((resolve, reject) => {
    printer.printDirect({
      data: buffer,
      printer: name,
      type: 'RAW',                  // CRÍTICO — manda ESC/POS cru, sem renderizar
      success: (jobId) => resolve({ ok: true, jobId }),
      error: (err) => reject(err),
    });
  });
}
```

### Detecção de modo no boot

```js
let method = 'spooler-native';
try {
  require('@thiagoelg/node-printer').getPrinters();  // probe
  logger.info('Modo de impressão: spooler-native (node-printer)');
} catch (e) {
  method = 'spooler-powershell';
  logger.warn(`node-printer indisponível (${e.message}). Usando fallback PowerShell.`);
}
```

### Modo fallback: PowerShell

Quando `method === 'spooler-powershell'`, escrever o buffer em arquivo temp e enviar via .NET `RawPrinterHelper`:

```js
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function printPowerShell(name, buffer) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `lp-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    fs.writeFileSync(tmpFile, buffer);

    const ps = `
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinter {
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }

  public static bool SendBytesToPrinter(string szPrinterName, byte[] bytes) {
    IntPtr hPrinter; DOCINFOA di = new DOCINFOA();
    di.pDocName = "LP-Bridge"; di.pDataType = "RAW";
    if (!OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) return false;
    bool ok = false;
    if (StartDocPrinter(hPrinter, 1, di)) {
      if (StartPagePrinter(hPrinter)) {
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
        Int32 written;
        ok = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written);
        Marshal.FreeCoTaskMem(pUnmanagedBytes);
        EndPagePrinter(hPrinter);
      }
      EndDocPrinter(hPrinter);
    }
    ClosePrinter(hPrinter);
    return ok;
  }
}
"@
$bytes = [System.IO.File]::ReadAllBytes("${tmpFile.replace(/\\/g, '\\\\')}")
$ok = [RawPrinter]::SendBytesToPrinter("${name}", $bytes)
if ($ok) { Write-Output "OK" } else { Write-Error "FAIL"; exit 1 }
`.trim();

    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', code => {
      try { fs.unlinkSync(tmpFile); } catch {}
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: stderr.trim() || `PowerShell exit ${code}` });
    });
  });
}
```

`listPrinters` no modo PowerShell:
```powershell
Get-Printer | Select-Object -ExpandProperty Name
```

`getStatus` no modo PowerShell:
```powershell
Get-Printer -Name "<name>" | Select-Object Name, PrinterStatus, JobCount | ConvertTo-Json
```

---

## Endpoints (`lp-bridge.js`)

**Manter contrato exato** dos existentes. Adicionar os novos.

### `GET /health`
```json
{
  "ok": true,
  "bridge_version": "2.1.0",
  "printer_method": "spooler-native",   // ou "spooler-powershell"
  "printer_name": "POS80_MeuSistema",
  "printer_status": "IDLE",              // IDLE | PRINTING | OFFLINE | PAPER_OUT | UNKNOWN
  "printer_ok": true,
  "queue_size": 0,
  "uptime_s": 1234
}
```

### `POST /print` — **mesmo contrato da v2**
Request:
```json
{ "payload": "<base64 ESC/POS>", "format": "escpos", "source": "palm-cupom" }
```
Response sucesso:
```json
{ "success": true, "jobId": "abc123", "printed_at": "2026-04-24T03:12:45.000Z" }
```
Response erro:
```json
{ "success": false, "error": "mensagem clara" }
```

Internamente: enfileira via `lib/queue.js` → worker chama `printer.printRaw(config.printer_name, Buffer.from(payload, 'base64'))`.

### `GET /printers` — **NOVO comportamento**
Retorna **impressoras instaladas no Windows** (não mais devices USB):
```json
{ "printers": ["POS80_MeuSistema", "Microsoft Print to PDF", "OneNote", "..."] }
```

### `POST /config` — **NOVO**
Request:
```json
{ "printer_name": "POS80_MeuSistema" }
```
Response:
```json
{ "ok": true, "printer_name": "POS80_MeuSistema" }
```
Persiste em `config.json` ao lado do `.exe`.

### `GET /test`
Imprime cupom de teste curto na impressora configurada. Mesmo formato de resposta do `POST /print`.

---

## `package.json`

```json
{
  "name": "lp-bridge",
  "version": "2.1.0",
  "main": "lp-bridge.js",
  "bin": "lp-bridge.js",
  "scripts": {
    "start": "node lp-bridge.js",
    "build": "pkg . --targets node18-win-x64 --output dist/lp-bridge-v2.1.exe --public-packages \"*\""
  },
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "@thiagoelg/node-printer": "^0.6.4",
    "winston": "^3.13.0",
    "winston-daily-rotate-file": "^5.0.0"
  },
  "devDependencies": {
    "pkg": "^5.8.1"
  },
  "pkg": {
    "assets": [
      "node_modules/@thiagoelg/node-printer/build/Release/**/*"
    ],
    "targets": ["node18-win-x64"]
  }
}
```

---

## `start-bridge.bat`

```bat
@echo off
TITLE Ponte de Impressao v2.1 - Plano B
echo ============================================
echo   Bridge v2.1 - Spooler do Windows
echo   Sem libusb, sem Zadig
echo ============================================

IF NOT EXIST node_modules (
    echo Instalando dependencias...
    call npm install
)

echo Iniciando Bridge na porta 3001...
node lp-bridge.js
pause
```

---

## `build.bat`

```bat
@echo off
echo Compilando lp-bridge-v2.1.exe...
call npm install
call npx pkg . --targets node18-win-x64 --output dist\lp-bridge-v2.1.exe --public-packages "*"

REM Copiar binding nativo ao lado do exe (necessário para node-printer no pkg)
xcopy /Y /E /I node_modules\@thiagoelg\node-printer\build\Release dist\build\Release

echo.
echo OK -> dist\lp-bridge-v2.1.exe
echo Copie a pasta dist\ inteira para o PC alvo.
pause
```

---

## Logs

Manter winston-daily-rotate-file da v2. Adicionar no boot:
```
[BOOT] Bridge v2.1.0
[BOOT] Modo de impressão: spooler-native | spooler-powershell
[BOOT] Impressora configurada: POS80_MeuSistema
[BOOT] Status inicial: IDLE
[BOOT] HTTP: http://0.0.0.0:3001
```

Em cada `/print`:
```
[PRINT] job=<id> source=<palm-cupom> bytes=<N> queue=<size>
[PRINT] job=<id> OK em <ms>ms
```

---

## Critérios de aceite

1. ✅ `lp-bridge-v2.1.exe` sobe sem erro de USB.
2. ✅ `GET /health` retorna `printer_method: "spooler-native"` (ou `spooler-powershell` se native falhar) e `printer_name: "POS80_MeuSistema"`.
3. ✅ `GET /printers` lista impressoras do Painel do Windows (incluindo `POS80_MeuSistema`).
4. ✅ `GET /test` no navegador → cupom sai pela mesma impressora que o app de entregas usa.
5. ✅ 20 `POST /print` em loop saem em ordem (fila serializa).
6. ✅ App de entregas (iFood/Anota AI/etc.) **continua imprimindo normal** em paralelo.
7. ✅ Tirar papel → `/health` mostra `paper_out` ou `OFFLINE`.
8. ✅ `POST /config` com novo `printer_name` persiste em `config.json` e passa a valer sem reiniciar.
9. ✅ Compatibilidade: site atual (que chama `POST /print` com `{payload, format, source}` em base64) **funciona sem nenhuma alteração**.

---

## Não fazer

- ❌ NÃO usar `escpos`, `escpos-usb`, `usb`, `node-usb`.
- ❌ NÃO instruir o usuário a rodar Zadig ou trocar driver para WinUSB.
- ❌ NÃO renderizar ESC/POS como bitmap. Enviar como `RAW` puro.
- ❌ NÃO mudar contrato de `POST /print` (site depende dele).
- ❌ NÃO assumir nome fixo da impressora no código — sempre ler de `config.json`.

---

## Entregáveis

1. Código completo em `bridge/` conforme estrutura acima.
2. `dist/lp-bridge-v2.1.exe` empacotado, com `dist/build/Release/` ao lado.
3. Um `README.md` curto em `bridge/README.md` explicando: como rodar, como trocar impressora via `POST /config`, e onde ficam os logs.

Fim do prompt.
