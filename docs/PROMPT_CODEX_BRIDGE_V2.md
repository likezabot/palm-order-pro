# Codex: Reescrever `lp-bridge` para v2.0.0 (fila + singleton USB + status real)

> Cole este prompt inteiro no Codex Desktop. Trabalhe **somente** dentro da pasta `bridge/` deste repositório. Ao final, gere o `.exe` novo conforme a seção 6.

---

## 1. Contexto

A pasta `bridge/` contém uma "ponte de impressão" Node.js (Express + `escpos` + `escpos-usb`) que roda como `.exe` na máquina do caixa do restaurante **Plano B Espetaria**. O frontend (PWA hospedado em `palm-order-pro.lovable.app`) faz `POST http://<host>:9100/print` com um payload ESC/POS já montado em base64, e a ponte envia para a impressora térmica USB.

**Versão atual**: `bridge/lp-bridge.js` (117 linhas, monolítico). Funciona nos primeiros minutos e depois **para silenciosamente** — bridge continua respondendo `200 OK`, mas a impressora não imprime mais nada. Operador precisa reiniciar o `.exe` para voltar.

### Causas raiz identificadas na auditoria

1. **Nova instância USB por request** (`new escpos.USB()` dentro de `getUSBPrinter()`). Em uso intenso, gera `LIBUSB_ERROR_BUSY` acumulado — a interface ainda não foi liberada quando a próxima request chega.
2. **`device.write` resolve antes da impressora terminar**. O callback do `escpos-usb` confirma só que o buffer USB foi aceito, não que o papel saiu. Bridge devolve `success:true` mesmo com paper-out ou cover-open.
3. **Sem fila**. Dois `POST /print` simultâneos (garçom + caixa, por exemplo) tentam abrir o mesmo device em paralelo → segundo falha ou corrompe o primeiro.
4. **Sem timeout / sem cleanup em paths de erro**. Handle USB pode ficar pendurado.
5. **`/health` é mentiroso** — só verifica se há *algum* device USB enumerado, não o status físico da impressora.
6. **Sem log persistente** — quando trava, nenhum rastro pra diagnosticar.
7. **Listen em `localhost`** sem garantia de `0.0.0.0` — celulares na mesma rede Wi-Fi não alcançam.
8. **Sem endpoint de teste isolado** — pra testar precisa do site inteiro.

---

## 2. Objetivo da v2.0.0

Reescrever `bridge/lp-bridge.js` em arquitetura modular, mantendo **100% de compatibilidade** com o contrato atual (`POST /print` com `{payload, format, source}` → `{success, error}`), e adicionando:

- Singleton USB persistente.
- Fila FIFO serializada (1 worker, 1 job por vez).
- Leitura de status físico real via `DLE EOT n`.
- Retry interno com backoff.
- Timeout duro por job.
- Auto-recovery após erros consecutivos.
- Log rotativo em arquivo.
- Endpoints novos (`GET /test`, `GET /jobs/:id`) e `/health` enriquecido.

---

## 3. Estrutura final esperada

```text
bridge/
  lp-bridge.js          ← entry point Express (curto, só wiring)
  lib/
    printer.js          ← singleton USB, abre/reabre, lê status DLE EOT
    queue.js            ← FIFO worker, processa jobs serialmente
    logger.js           ← winston rotativo
  package.json          ← +winston, +winston-daily-rotate-file, +uuid
  start-bridge.bat      ← inalterado
  README.md             ← docs novas (seção 5 deste prompt)
```

---

## 4. Especificação técnica detalhada

### 4.1 `lib/logger.js`

- Usar `winston` + `winston-daily-rotate-file`.
- Caminho: `path.join(process.env.APPDATA || os.tmpdir(), 'lp-bridge', 'bridge-%DATE%.log')`.
- Rotação diária, retenção 7 dias, max 10MB por arquivo.
- Nível padrão `info`. Se `process.env.LP_BRIDGE_DEBUG === '1'`, usar `debug`.
- Também loga no console (formato simples, com timestamp).
- Exporta `logger` (instance) e helper `logger.hexDump(buffer)` que loga o hex do buffer só em nível debug.

### 4.2 `lib/printer.js` — Singleton USB

Exporta uma classe `PrinterManager` (singleton via `module.exports = new PrinterManager()`) com:

```js
{
  isOpen: boolean,
  lastError: string|null,
  lastPrintAt: ISO string|null,
  consecutiveErrors: number,

  async ensureOpen()           // abre device se não estiver aberto; idempotente
  async close()                // fecha handle
  async reopen()               // close + open
  async readStatus()           // retorna 'ok'|'paper_out'|'cover_open'|'offline'
  async writeBuffer(buf)       // escreve raw buffer ESC/POS, com retry interno
  getInfo()                    // { connected, status, lastPrintAt, lastError }
}
```

**Detalhes**:

- `ensureOpen()`: chama `escpos.USB.findPrinter()`. Se vazio → marca `offline`, throw `Error('Nenhuma impressora USB detectada')`. Se achou, faz `new escpos.USB()` e `device.open(cb)` com Promise wrapper. Guarda `this.device`.
- `readStatus()`: envia `Buffer.from([0x10, 0x04, 0x01])` (printer status) e `Buffer.from([0x10, 0x04, 0x04])` (paper sensor). Lê resposta com timeout 500ms (use `device.read` se disponível; se a lib não expor, faz fallback para `'ok'` quando o device está aberto e loga warning). Interpreta bits conforme spec ESC/POS:
  - status byte bit 3 (`0x08`) → offline
  - status byte bit 5 (`0x20`) → cover_open (em algumas impressoras)
  - paper byte bits 2-3 (`0x0C`) → paper_out
- `writeBuffer(buf)`:
  1. `await this.ensureOpen()`.
  2. `await this.readStatus()`. Se `paper_out`/`cover_open`/`offline` → throw com mensagem clara, **sem** consumir retry.
  3. Tenta `device.write(buf, cb)` envolvido em Promise com timeout 8000ms.
  4. Se erro recuperável (`LIBUSB_ERROR_BUSY`, `LIBUSB_ERROR_TIMEOUT`) → espera 500ms, tenta de novo. Máximo **2 retries** (3 tentativas no total).
  5. Se erro fatal (`LIBUSB_ERROR_NO_DEVICE`, `LIBUSB_ERROR_PIPE`) → `await this.reopen()` antes de propagar.
  6. Sucesso → `this.lastPrintAt = new Date().toISOString()`, `this.consecutiveErrors = 0`.
  7. Erro final → `this.consecutiveErrors++`. Se `>=3` → `await this.reopen()` e zera contador.
- Não fecha o device entre writes. **Singleton sempre aberto.**

### 4.3 `lib/queue.js` — Fila FIFO

```js
class JobQueue {
  enqueue(payloadBuffer, source) → { jobId, promise }
  getJob(jobId) → { id, status: 'queued'|'printing'|'done'|'error', queuedAt, startedAt, finishedAt, printedAt, printerOk, error, source }
  depth() → number  // jobs queued + 1 if processing
}
```

- `jobId` = `uuid.v4()`.
- Mantém Map de últimos 100 jobs (LRU).
- Worker loop: pega próximo, marca `printing`, chama `printer.writeBuffer(buf)`, marca `done` com `printedAt = new Date().toISOString()` e `printerOk = true`. Em erro, marca `error` com mensagem.
- Resolve a promise retornada do `enqueue` com `{ jobId, printed_at, printer_ok, error? }` quando job termina.
- Loga cada transição via `logger`.

### 4.4 `lp-bridge.js` — Entry point

- Express com `cors()` aberto e `express.json({ limit: '10mb' })`.
- `app.listen(9100, '0.0.0.0', ...)`.
- Banner no console com versão `2.0.0`, caminho do log, IP local detectado (`os.networkInterfaces()` filtrado IPv4 não-loopback).
- No boot: `await printer.ensureOpen().catch(err => logger.warn(...))` — não derruba o processo se impressora estiver offline.

**Endpoints**:

#### `GET /health`
```json
{
  "online": true,
  "bridge_version": "2.0.0",
  "printer_connected": true,
  "printer_status": "ok",
  "queue_depth": 0,
  "last_print_at": "2026-04-24T12:34:56.789Z",
  "last_error": null,
  "timestamp": "2026-04-24T12:35:00.000Z"
}
```
Chama `printer.readStatus()` (com try/catch). Sempre responde 200.

#### `POST /print`
- Body: `{ payload: string (base64), format?: string, source?: string }`.
- Valida payload presente.
- `const buf = Buffer.from(payload, 'base64')`.
- `const { jobId, promise } = queue.enqueue(buf, source || 'unknown')`.
- `await promise` (com timeout externo de 15s como guarda).
- Resposta sucesso (200):
  ```json
  { "success": true, "jobId": "...", "printed_at": "...", "printer_ok": true }
  ```
- Resposta erro (500 ou 503):
  ```json
  { "success": false, "error": "mensagem clara em pt-BR", "jobId": "..." }
  ```
- **IMPORTANTE**: manter o shape mínimo `{success, error}` — o site v1 só lê esses dois campos.

#### `GET /jobs/:id`
- Retorna o objeto do job ou `404 { error: 'job not found' }`.

#### `GET /test`
- Monta payload mínimo:
  ```js
  Buffer.concat([
    Buffer.from([0x1B, 0x40]),                      // ESC @ (init)
    Buffer.from('TESTE BRIDGE v2\n\n\n', 'ascii'),
    Buffer.from([0x1D, 0x56, 0x00])                 // GS V 0 (full cut)
  ])
  ```
- Enfileira, aguarda, responde HTML simples mostrando `jobId`, status, `printed_at` e botão "rodar de novo". Pra abrir no navegador e ver na hora.

#### `GET /printers`
- Mantém comportamento atual (`escpos.USB.findPrinter()`).

### 4.5 Tratamento de erros

- Toda Promise rejection no Express é capturada por middleware de erro que loga via `logger.error` e responde JSON `{success:false, error}`.
- `process.on('uncaughtException')` e `process.on('unhandledRejection')` logam mas **não derrubam** o processo.

### 4.6 `package.json`

```json
{
  "name": "lp-bridge",
  "version": "2.0.0",
  "description": "Ponte de impressão térmica v2 — Plano B Espetaria",
  "main": "lp-bridge.js",
  "bin": "lp-bridge.js",
  "scripts": {
    "start": "node lp-bridge.js",
    "build:exe": "pkg . --targets node18-win-x64 --output lp-bridge.exe --public-packages \"*\""
  },
  "pkg": {
    "assets": ["node_modules/escpos-usb/**/*", "node_modules/usb/**/*"],
    "targets": ["node18-win-x64"]
  },
  "dependencies": {
    "cors": "^2.8.5",
    "escpos": "^3.0.0-alpha.6",
    "escpos-usb": "^3.0.0-alpha.4",
    "express": "^4.18.2",
    "uuid": "^9.0.1",
    "winston": "^3.13.0",
    "winston-daily-rotate-file": "^5.0.0"
  }
}
```

### 4.7 `start-bridge.bat` — não alterar

Continua chamando `node lp-bridge.js`. O `.exe` empacotado roda direto, sem `.bat`.

---

## 5. README.md (criar/atualizar `bridge/README.md`)

Inclua:

- Como instalar (`npm install` na pasta `bridge/`).
- Como rodar em dev (`npm start`).
- Como gerar `.exe` (`npm run build:exe`).
- Lista de endpoints com exemplo `curl`.
- Onde fica o log (`%APPDATA%/lp-bridge/bridge-YYYY-MM-DD.log`).
- Como ativar debug (`set LP_BRIDGE_DEBUG=1` antes de iniciar).
- **Seção "Testes manuais de aceite"** com:
  1. Abrir `http://localhost:9100/test` no Chrome → cupom "TESTE BRIDGE v2" sai.
  2. Abrir `http://localhost:9100/health` → JSON com `bridge_version: "2.0.0"` e `printer_status` real.
  3. Loop de 20 prints via `curl` (cole o snippet `for /L %i in (1,1,20) do curl -X POST ...`) → todos saem **em ordem**, nenhum perdido.
  4. Tirar o papel da impressora → `/health` mostra `paper_out` em até 2s; próximo `/print` retorna erro 503 claro.
  5. Desligar a impressora → `/health` mostra `offline`; jobs novos falham com mensagem.
  6. Religar a impressora → bridge volta sozinha, **sem reiniciar o `.exe`**.

---

## 6. Empacotamento `.exe`

Após escrever todo o código:

```powershell
cd bridge
npm install
npm install -g pkg
npm run build:exe
```

Saída esperada: `bridge/lp-bridge.exe`. Teste rodando direto com duplo clique — deve abrir console preto com banner v2.0.0.

Se `pkg` reclamar de módulo nativo (`usb`, `escpos-usb`), inclua-os manualmente via `--public-packages "*"` (já no script) e copie a pasta `node_modules/usb/build/Release/` para o lado do `.exe` se necessário (documentar isso no README).

---

## 7. Compatibilidade com o site (não mexer no site)

O frontend já trata `bridge_version` no `/health`. Garanta apenas:

- `POST /print` continua aceitando `{payload, format, source}` em base64.
- Resposta de sucesso continua tendo `success: true`.
- Resposta de erro continua tendo `success: false, error: string`.

Os campos extras (`jobId`, `printed_at`, `printer_ok`, `bridge_version`, `printer_status`, `queue_depth`, `last_print_at`, `last_error`) são **adicionais** — site v1 ignora, site v2 usa.

---

## 8. Checklist final antes de me devolver

- [ ] `bridge/lp-bridge.js` reescrito como entry point modular.
- [ ] `bridge/lib/printer.js`, `bridge/lib/queue.js`, `bridge/lib/logger.js` criados.
- [ ] `bridge/package.json` atualizado para `2.0.0` com novas deps e script `build:exe`.
- [ ] `bridge/README.md` com docs e roteiro de aceite.
- [ ] `npm install` roda sem erro.
- [ ] `npm start` sobe servidor com banner v2.0.0 escutando em `0.0.0.0:9100`.
- [ ] `curl http://localhost:9100/health` retorna JSON com `bridge_version: "2.0.0"`.
- [ ] `curl http://localhost:9100/test` enfileira e imprime cupom de teste.
- [ ] `npm run build:exe` gera `lp-bridge.exe` funcional.
- [ ] Site antigo (campo `URL DA PONTE` apontando pra `http://localhost:9100/print`) continua imprimindo normalmente.

Quando terminar, me devolva: caminho do `.exe`, tamanho, e print do `npm start` mostrando o banner.
