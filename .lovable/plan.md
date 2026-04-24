

# Bridge v2.1 — imprimir via Spooler do Windows (sem Zadig)

## Por que essa mudança

A v2 falhou com `LIBUSB_ERROR_NOT_SUPPORTED` porque o Windows usa o driver nativo da impressora (`POS80_MeuSistema`), e `escpos-usb` exige WinUSB/libusb (que quebraria o app de entregas). Solução: parar de falar USB raw e enviar o ESC/POS direto pra **fila de impressão do Windows**, mesmo caminho que o app de entregas usa hoje.

## O que vou entregar

Um único arquivo: `docs/PROMPT_CODEX_BRIDGE_V2_1.md` — pronto pra colar no Codex Desktop. Esse prompt instrui o Codex a reescrever a camada de impressão da bridge.

## Especificação resumida da v2.1

**Stack nova:**
- Remove: `escpos`, `escpos-usb`
- Adiciona (primário): `@thiagoelg/node-printer` — envia buffer RAW pro spooler de uma impressora nomeada
- Fallback automático: `child_process` + PowerShell (`Out-Printer` / `WritePrinter` via .NET) caso o binding nativo falhe no `pkg`

**Arquitetura mantém o mesmo esqueleto da v2:**
```text
bridge/
  lp-bridge.js          ← entry Express (igual)
  lib/
    printer.js          ← REESCRITO: spooler em vez de USB raw
    queue.js            ← igual (FIFO 1 worker)
    logger.js           ← igual (winston rotativo)
  config.json           ← NOVO: { printer_name: "POS80_MeuSistema" }
```

**Endpoints (mantém compatibilidade total com site):**
- `GET /health` → adiciona `printer_name`, `printer_method: "spooler"`, `bridge_version: "2.1.0"`
- `POST /print` → mesmo contrato; internamente chama spooler em vez de USB
- `GET /printers` → agora lista impressoras **instaladas no Windows** (nomes como aparecem no Painel)
- `POST /config` → NOVO: salva `printer_name` em `config.json`
- `GET /test` → igual, usa a impressora configurada

**Regras técnicas:**
1. **Nome configurável**: lê `config.json` no boot (default `"POS80_MeuSistema"`). Aceita override via `POST /config`.
2. **Envio RAW**: `printer.printDirect({ data: buffer, printer: name, type: 'RAW' })` — o ESC/POS vai cru pro spooler, sem driver renderizando.
3. **Fila serializada**: 1 job por vez (já existe na v2).
4. **Status**: lê `printer.getPrinter(name)` → `status` retorna `IDLE`, `PRINTING`, `OFFLINE`, `PAPER_OUT`, etc. Reflete em `printer_status`.
5. **Fallback PowerShell**: se `node-printer` falhar no boot, ativa modo PowerShell automaticamente (mais lento ~200ms mas zero dependência nativa). Loga qual modo está ativo.
6. **Empacotamento `pkg`**: usa `--public-packages "*"` e copia `node_modules/@thiagoelg/node-printer/build/Release/` ao lado do `.exe`. Se der ruim, usa o caminho PowerShell que funciona em qualquer Windows.
7. **Convivência com app de entregas**: ✅ confirmado — ambos usam o spooler, sem conflito de driver.

## Ajuste mínimo no site (mesmo passo)

Adicionar campo "Nome da Impressora no Windows" no painel **Admin → Impressão → Diagnóstico**, com:
- Botão "Listar impressoras" (chama `/printers` da bridge)
- Select com as impressoras detectadas
- Botão "Salvar" (chama `POST /config` da bridge)
- Default sugerido: `POS80_MeuSistema`

Arquivos tocados no site:
- `src/components/admin/PrinterDiagnostics.tsx` — adicionar seção "Configuração da Impressora"
- `src/lib/thermal-printer.ts` — funções `listBridgePrinters()` e `setBridgePrinter(name)`

## Critérios de aceite (no README do prompt)

- `lp-bridge-v2.1.exe` sobe sem erro de USB
- `/health` retorna `printer_method: "spooler"` e `printer_name: "POS80_MeuSistema"`
- `/test` no navegador → cupom sai pela mesma impressora que o app de entregas usa
- 20 prints em loop saem em ordem
- App de entregas continua imprimindo normal em paralelo (sem conflito)
- Tirar papel → `/health` mostra `paper_out` (via status do spooler do Windows)

## Ordem de execução

1. Eu crio `docs/PROMPT_CODEX_BRIDGE_V2_1.md` (este passo)
2. Você cola no Codex → gera bridge v2.1 + `.exe`
3. Você roda o `.exe` novo → confirma `/health` e `/test`
4. Eu ajusto o site pra ter o seletor de impressora (passo seguinte, separado)

## Arquivos tocados agora

- **Novo**: `docs/PROMPT_CODEX_BRIDGE_V2_1.md`

Nenhum código de produção alterado. Bridge v1 continua rodando.

