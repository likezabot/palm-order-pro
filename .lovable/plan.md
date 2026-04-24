

# Auditoria de impressão + plano de ação

## Diagnóstico do que existe hoje

Pipeline atual (resumo):

```text
Palm/Pdv → INSERT/UPDATE em orders (print_status='pending')
        → Realtime → global-order-runtime
        → claim_order_print (RPC, atômica)
        → autoPrintOrder/autoPrintUpdate (print-service)
            ├─ build ESC/POS (thermal-printer)
            ├─ POST http://localhost:9100/print  (bridge .exe)
            ├─ sucesso → complete_order_print
            └─ falha   → enqueue IndexedDB + defer_order_print
        → print-queue-worker (15s) reenvia quando bridge volta
```

### Pontos frágeis encontrados

1. **Bridge atual é “fire-and-forget”**. O `device.write()` do `escpos-usb` resolve o callback assim que o **buffer USB foi aceito**, não quando a impressora **terminou de imprimir**. Resultado: bridge devolve `success=true` mesmo quando a impressora engasgou, está sem papel ou está em erro de hardware.
2. **`getUSBPrinter()` cria nova instância USB a cada request**. Em uso intenso isso causa `LIBUSB_ERROR_BUSY` intermitente (a impressora ainda não liberou a interface da request anterior). Esse é o padrão clássico de “imprime nos primeiros minutos e depois para”.
3. **Sem fila no bridge**. Dois POSTs simultâneos (ex.: pedido + acréscimo de outro garçom) tentam abrir o mesmo device em paralelo → segundo falha silenciosamente OU corrompe o primeiro.
4. **Sem timeout / sem `device.close()` em alguns paths de erro**. Se `device.open()` retorna erro, o handle USB pode ficar pendurado até o `.exe` reiniciar.
5. **Sem watchdog de printer real**. `/health` só verifica se há *algum* dispositivo USB enumerado — não testa status da impressora (online/paper-out/cover-open via `DLE EOT`).
6. **Web não consegue diferenciar “bridge OK + impressora travada”**. Hoje qualquer 200 do bridge marca o pedido como `printed`. Se o bridge mente, o pedido nunca é reimpresso automaticamente.
7. **Sem log persistente do bridge**. Quando para, não há rastro pra diagnosticar.
8. **Não existe botão de teste no Admin que envie um payload binário pequeno “puro”** (só o teste que monta cupom de exemplo e cai no mesmo pipeline).

## O que vou fazer

### Parte 1 — Web (este projeto)

**1.1 Botão de auto-diagnóstico em `Admin → Impressão`**
Painel novo “Diagnóstico da Impressora” com 3 botões:
- **Health avançado**: bate em `/health` e mostra latência, `printer_count`, `printer_status` (novo campo do bridge v2 que vamos pedir).
- **Teste mínimo (1 linha + corte)**: envia ESC/POS curtinho — `ESC @` + “TESTE PLANO B\n” + `GS V`. Se isso não sair, problema é 100% bridge/USB, não payload.
- **Teste cupom completo**: o que já existe (mantém).

Mostra resultado de cada um em uma timeline com hora, latência e mensagem de erro.

**1.2 Confirmar impressão real (handshake)**
Mudar `sendToBridge` para tratar como sucesso só se a resposta tiver `printed_at` (timestamp de fim de escrita) **e** `printer_ok: true` (status físico da impressora). Se vier só `success:true` legado, tratar como “ambíguo” e deixar o watchdog decidir após 90s — se o pedido continuar em `printing`, requeue.

**1.3 Watchdog mais agressivo + log de falha visível**
- Reduzir `requeue_stuck_print_jobs` de 90s → 45s.
- Adicionar painel “Pedidos travados em impressão” no Admin com botão *forçar reimprimir agora*.

**1.4 Teste automatizado**
Novo `src/lib/__tests__/print-pipeline.test.ts` cobrindo:
- payload mínimo gerado tem `ESC @` no início e `GS V` no fim.
- `autoPrintOrder` enfileira no IndexedDB quando bridge devolve 503.
- `autoPrintUpdate` com `print_type='extra'` e `delta_items=null` cai no fallback (full).

### Parte 2 — Bridge `.exe` (proposta a reescrever)

**Sim, vale a pena reescrever.** O `lp-bridge.js` atual tem 117 linhas e ignora os problemas listados acima. Proposta de v2 (continua Node + Express, mantém compatibilidade com o endpoint `/print` atual):

Arquitetura nova:

```text
POST /print
  → enfileira no JobQueue (in-memory FIFO, 1 worker)
  → responde imediato com {jobId, queued:true}
GET /jobs/:id
  → {status: queued|printing|done|error, printed_at, error}
GET /health
  → {online, printer_connected, printer_status: ok|paper_out|cover_open|offline,
     queue_depth, last_print_at}
GET /test
  → imprime payload mínimo de teste, retorna jobId
```

Detalhes técnicos:

- **Singleton USB**: abre device 1x no boot, mantém aberto, reabre só se erro fatal. Elimina o `LIBUSB_ERROR_BUSY`.
- **Fila serializada**: 1 job por vez. Nada de paralelo no USB.
- **Confirmação de status real**: lê `DLE EOT n` (Real-time status) antes e depois do write. Detecta paper-out, cover-open, offline. Reflete no `/health` e no response.
- **Retry interno**: se write falhar com erro recuperável, tenta 2x com 500ms de intervalo antes de devolver erro.
- **Timeout duro**: 8s por job. Se estourar, mata a transação, tenta resetar device.
- **Log em arquivo**: `bridge.log` rotativo (1 dia), nível debug, com hex dump opcional do payload.
- **Endpoint `/test`**: sem precisar do site, abrir `http://localhost:9100/test` no navegador → cupom de teste sai.
- **Auto-recovery**: se 3 jobs falharem seguidos, reseta device USB (`device.close()` + reabre) automaticamente.
- **Versão no `/health`**: `bridge_version: "2.0.0"` — site usa pra avisar quando estiver no v1 antigo.

Arquivos do bridge:

```text
bridge/
  lp-bridge.js           ← novo (entry point)
  lib/
    queue.js             ← FIFO worker
    printer.js           ← singleton USB + status reading
    logger.js            ← arquivo rotativo
  package.json           ← +pino, +winston (log)
  start-bridge.bat       ← inalterado
  README.md              ← docs novas + endpoint /test
```

Empacotamento `.exe` continua via `pkg`/`nexe` (mesmo processo do atual).

## Ordem de execução

1. **Aplicar Parte 1 no site** (botões de diagnóstico + watchdog 45s + teste binário mínimo + handshake opcional). Sem mexer no bridge ainda.
2. Você roda os novos testes do Admin com o **bridge antigo** e me manda o resultado. Isso confirma se o problema vem do USB/bridge ou da web.
3. Se confirmado, **gero o pacote completo do bridge v2** numa pasta `bridge-v2/` com todo o código novo + instruções de build do `.exe` para você passar pro Codex empacotar.
4. Quando o v2 estiver rodando, o site detecta pelo `/health.bridge_version` e ativa os campos extras (status físico da impressora, queue depth, etc).

## Arquivos que vão ser tocados na Parte 1

- `src/components/admin/PrintConfigPanel.tsx` — adicionar seção “Diagnóstico”.
- `src/lib/thermal-printer.ts` — função `sendTestMinimal()` e ajuste no parser do response do bridge.
- `src/lib/global-order-runtime.ts` — watchdog 45s.
- `src/components/admin/SystemTab.tsx` — painel “Pedidos travados em impressão”.
- `src/lib/__tests__/print-pipeline.test.ts` — novo.

Bridge antigo continua funcionando. Nada quebra.

