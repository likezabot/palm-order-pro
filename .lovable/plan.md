

# Plano: parar a tempestade de re-impressão e a lentidão

## Causa raiz (confirmada nos logs e no código)

A ponte (`localhost:9100`) está **offline** — todo POST `/print` retorna `Failed to fetch`. O código atual faz isto a cada falha:

1. `autoPrintUpdate` é chamado.
2. `claim_order_print` (RPC) marca o pedido como `printing` e retorna `true`.
3. Bridge falha → `enqueueOnBridgeFailure` enfileira no IndexedDB → **`failPrint` chama `fail_order_print`** → o RPC reseta `print_status` de volta para `pending`.
4. Realtime emite UPDATE em `orders` → `printReset = true` → dispara `runAutoPrint` de novo → volta ao passo 1.

Resultado visível nos logs: 3 pedidos pendentes em loop infinito (`claim_order_print` POST a cada ~1s para cada pedido), saturando rede + CPU + invalidando React Query a cada ciclo. Tudo trava.

Agravante: como cada `failPrint` reseta para `pending`, o pedido também reaparece no `bootstrapPending` toda vez que o realtime se reconecta, replicando o storm.

E o realtime em si está caindo (`CHANNEL_ERROR`) provavelmente **por causa** da carga que esses POSTs criam no canal anon.

## O que o sistema deveria fazer

Quando a ponte está offline e o job já foi enfileirado no IndexedDB, **não é função do `autoPrint` ficar tentando**. Quem reprocessa fila offline é o `print-queue-worker.ts` (que já existe, já roda a cada 15s, já checa `bridge.health` antes de tentar). O `autoPrint` deveria desistir silenciosamente.

## Correções

### 1. Cortar o loop de retry imediato (causa principal)

Em `src/lib/print-service.ts`, no caminho `bridge_offline_queued` de `autoPrintOrder` e `autoPrintUpdate`:

- **Não chamar `failPrint` quando o job foi enfileirado.** Em vez disso, criar um novo RPC ou usar uma flag que mantém o pedido como `pending` **sem regravar `updated_at`** — ou melhor, marcar como `queued` (novo estado terminal para o realtime) para que o `printReset = old.print_status !== "pending"` não dispare de novo.
- Mais simples e seguro: novo RPC `defer_order_print(p_order_id)` que define `print_status = 'queued'`, **sem mexer em `updated_at`** (ou usando `pg_trigger_depth`-aware update). O worker da fila, ao reimprimir com sucesso, chama `complete_order_print` (que já lida com `queued`/`printing`/`pending`).

### 2. Ignorar `printReset` para pedidos `queued`

Em `global-order-runtime.ts`, na lógica do UPDATE:

```ts
const printReset =
  updated.print_status === "pending" &&
  old.print_status !== "pending" &&
  old.print_status !== "queued"; // ← evita reentrar quando worker reprocessa
```

E o detector positivo de novo:

```ts
// só dispara autoprint se realmente é novo print pendente,
// não um job devolvido pela fila offline
if (printReset && updated.print_status === "pending") { ... }
```

### 3. Circuit breaker no `runAutoPrint`

Adicionar um **cooldown por order_id** no `inFlight`:

```ts
const recentlyAttempted = new Map<string, number>(); // orderId → lastAttempt ms
const COOLDOWN_MS = 30_000;

if (recentlyAttempted.has(order.id) && 
    Date.now() - recentlyAttempted.get(order.id)! < COOLDOWN_MS) {
  return; // não tenta o mesmo pedido em < 30s
}
recentlyAttempted.set(order.id, Date.now());
```

Isso é uma rede de segurança independente da causa raiz. Mesmo se algum outro evento disparar autoprint de novo, não vira loop.

### 4. Bootstrap não retoma pedidos `queued`

Em `bootstrapPending`, filtrar `print_status = 'pending'` apenas (já filtra) — mas garantir que pedidos enfileirados no IndexedDB **não** estejam mais como `pending` no banco (ponto 1 resolve isso).

### 5. Health check do bridge com cache curto

Em `thermal-printer.ts`, o `checkBridgeStatus` é chamado por todo POST. Como o estado da ponte muda pouco, cachear o resultado por **5s**:

```ts
let lastHealthCheck = { at: 0, online: false, printer_connected: false };
if (Date.now() - lastHealthCheck.at < 5_000) return lastHealthCheck;
```

Reduz drasticamente os fetches a `localhost:9100/health`.

### 6. Migração SQL: novo estado `queued` + RPC `defer_order_print`

```sql
-- print_status já é text, não precisa CHECK constraint; só adicionar valor.
CREATE OR REPLACE FUNCTION public.defer_order_print(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET print_status = 'queued',
      print_error = 'bridge_offline_queued'
      -- NOTA: não tocamos em updated_at de propósito
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.defer_order_print(uuid) TO public;
```

E ajustar `complete_order_print` para aceitar transição de `queued` → `printed` (provavelmente já aceita, validar).

E `requeue_stuck_print_jobs` (watchdog) deve **ignorar** `print_status = 'queued'` — esses não estão presos, estão na fila do IndexedDB local.

## Arquivos afetados

- `src/lib/print-service.ts` — substituir `failPrint` por `deferPrint` no caminho `bridge_offline_queued`.
- `src/lib/global-order-runtime.ts` — cooldown de 30s + ajuste do `printReset`.
- `src/lib/thermal-printer.ts` — cache de 5s no `checkBridgeStatus`.
- `src/lib/print-queue-worker.ts` — ao reimprimir com sucesso, garantir `complete_order_print` (já faz).
- 1 migração SQL — `defer_order_print` + ajuste de `requeue_stuck_print_jobs` para ignorar `queued`.

## Resultado esperado

- **Ponte offline**: pedidos pendentes vão para `queued`, o worker do IndexedDB tenta a cada 15s (com `health` cacheado por 5s = 1 fetch / 15s). Realtime para de receber UPDATEs em loop. UI volta a responder.
- **Ponte volta**: worker detecta no próximo tick e imprime tudo que está enfileirado. Marca `printed`.
- **Pedido novo enquanto offline**: entra como `pending` → `autoPrintOrder` tenta uma vez → falha → vai para `queued` → worker assume.

Sem mais tempestade, sem mais lentidão, sem mais `CHANNEL_ERROR` por sobrecarga.

