

## Fallback de impressão — fila local com retry automático

Adicionar uma camada de resiliência ao pipeline de impressão: quando o bridge `.exe` falhar, o pedido vai para uma **fila local em IndexedDB**, e um worker tenta reimprimir periodicamente até o bridge voltar.

### Arquitetura

```
autoPrintOrder/Delta → tenta bridge
                       ├── sucesso → complete_order_print + remove da fila
                       └── falha   → fail_order_print + ENFILEIRA em IndexedDB
                                       ↓
                           PrintQueueWorker (a cada 15s)
                                       ↓
                           pingBridge() OK? → reprocessa fila (FIFO)
```

### 1. Nova lib: `src/lib/print-queue.ts`

Fila persistente em **IndexedDB** (sobrevive a reload, fechamento de aba, queda de energia). Não usa localStorage para evitar limite de 5MB e bloqueio síncrono.

API:
- `enqueuePrintJob(job)` — adiciona à fila
- `getPrintQueue()` — lista jobs pendentes
- `removePrintJob(id)` — remove após sucesso
- `incrementAttempts(id, error)` — registra falha
- `clearPrintQueue()` — limpa tudo (admin)

Schema do job:
```ts
{
  id: string;             // uuid local
  orderId: string;
  tableName: string;
  payload: ReceiptPayload; // o HTML/comandos já renderizados
  printType: 'full' | 'delta' | 'bill';
  attempts: number;
  lastError?: string;
  createdAt: number;
  lastAttemptAt?: number;
}
```

DB: `print-queue-db` v1, store `jobs` keyPath `id`, índice por `createdAt`.

### 2. Atualizar `src/lib/print-service.ts`

Nos pontos onde hoje chama `fail_order_print` por erro de bridge, **antes** disso enfileira o job. Idempotente: se já existe job para `orderId+printType`, atualiza em vez de duplicar.

```ts
catch (err) {
  await enqueuePrintJob({ orderId, tableName, payload, printType });
  await supabase.rpc('fail_order_print', { p_order_id: orderId, p_error: err.message });
  return { printed: false, reason: 'bridge_offline_queued' };
}
```

### 3. Worker: `src/lib/print-queue-worker.ts`

Singleton iniciado uma vez no `main.tsx`. Loop com `setInterval(15_000)`:

1. Se fila vazia → `idle`.
2. `pingBridge()` (HEAD/GET no `lp-bridge` em `localhost:porta/health`).
3. Bridge offline → não tenta, marca `lastAttemptAt`.
4. Bridge online → para cada job (FIFO, max 3 por ciclo):
   - Reenvia via `thermal-printer.printRaw(payload)`.
   - Sucesso → `complete_order_print(orderId)` + `removePrintJob(id)`.
   - Falha → `incrementAttempts(id, err)`. Após 10 tentativas, marca como `dead` (mantém no histórico, não tenta mais).
5. Backoff exponencial leve: jobs com >3 tentativas só reprocessam após 1min.

Pausa o worker quando `document.hidden` para não consumir bateria/CPU em background.

### 4. UI: status da fila no `PrintStation.tsx`

Adicionar um painel pequeno no topo:
- Badge "Fila: 0" (verde) / "Fila: N" (warning) / "Fila: N (offline)" (destructive).
- Botão "Reprocessar agora" → força `worker.tick()`.
- Botão "Limpar fila" (com confirm) → `clearPrintQueue()`.
- Lista expansível com jobs (mesa, tipo, tentativas, último erro).

Hook novo: `src/hooks/use-print-queue.ts` — escuta mudanças via `BroadcastChannel('print-queue')` que o worker emite a cada operação.

### 5. Notificação ao usuário

No PDV, quando `autoPrintOrder` retornar `bridge_offline_queued`:
- Toast warning: "Bridge offline — pedido enfileirado (Mesa X). Reprocessará automaticamente."
- Não bloqueia fluxo.

### 6. Garantias

- **Bridge `.exe` intocado** — só consumimos o endpoint que já existe.
- **RPCs intocadas** — só usamos `fail_order_print` / `complete_order_print` que já existem.
- **Realtime intocado**.
- **Idempotência**: dedupe por `orderId+printType`. Reimpressões duplicadas são impossíveis porque `complete_order_print` só fecha quando `print_status = 'printing'`.
- **Sem migração de banco** — fila é 100% client-side.

### Arquivos novos
- `src/lib/print-queue.ts`
- `src/lib/print-queue-worker.ts`
- `src/hooks/use-print-queue.ts`

### Arquivos modificados
- `src/lib/print-service.ts` — enfileira em catch
- `src/main.tsx` — inicia worker
- `src/pages/PrintStation.tsx` — UI da fila
- `src/hooks/use-pdv-realtime.ts` — toast quando `reason === 'bridge_offline_queued'`

### Resultado esperado

- Bridge cai → pedido vai pra fila, operador vê toast.
- Bridge volta → fila esvazia sozinha em até 15s, sem clique.
- Recarregar página/fechar aba **não perde** jobs (IndexedDB persiste).
- PrintStation mostra status real-time da fila.
- Zero impacto em pedidos quando bridge está saudável.

