# Prompt v2 — Impressão para depois de 5min de uso

> Continuação do `PROMPT_CODEX_BUG_IMPRESSAO_PEDIDO_NOVO.md`. A correção do total=0 funcionou no boot, mas após ~5min a impressão **para completamente**. Logs novos abaixo apontam dois bugs distintos no pipeline `claim → fetch → send`.

## Contexto

- Stack: React + Supabase + bridge local Node (`bridge/lp-bridge.js` :3001), impressora ESC/POS USB.
- Pipeline: `enqueue → claim_order_print → fetch order → buildPayload → POST /print → complete_order_print`.
- RPCs envolvidas: `claim_order_print`, `fail_order_print`, `defer_order_print`, `complete_order_print`, `requeue_stuck_print_jobs(p_seconds=90)`.

---

## BUG 1 — `print_type='extra'` sem `delta_items` é marcado como `fail` em vez de fallback para "full"

### Evidência (network log, 02:37:30Z)

```
POST /rpc/claim_order_print  {"p_order_id":"29ca7d45..."}  → true
GET  /orders?select=delta_items,print_type,waiter_name,original_table_name&id=eq.29ca7d45...
     → {"delta_items": null, "print_type": "extra", "waiter_name": "Jose", "original_table_name": "1"}
POST /rpc/fail_order_print  {"p_order_id":"29ca7d45...","p_error":"no_delta_items"}
```

E novamente em 02:37:00Z e 02:37:30Z (mesmo pedido) — o worker tenta 2x, falha 2x, **não cai pro fallback de imprimir o recibo completo do pedido**.

### Por que isso acontece

Cenário real: usuário cria um pedido novo e **antes** do trigger preencher `delta_items` o worker já está rodando (race condition na criação). O pedido entra com `print_type='extra'` mas `delta_items=null` porque o trigger de cálculo ainda não rodou — exatamente o mesmo padrão do bug do `total=0` da v1.

### Fix proposto (worker do `.exe`)

Em `src/lib/global-order-runtime.ts` (ou onde for o handler do claim), antes de chamar `fail_order_print` quando `delta_items` é `null|[]`:

```ts
// Após o fetch da order
if (order.print_type === 'extra' && (!order.delta_items || order.delta_items.length === 0)) {
  // Fallback: re-fetch do order completo + items e imprime como 'full'
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  if (items && items.length > 0) {
    debugLog.warn('print', `pedido ${orderId} tem print_type=extra sem delta_items — fallback para full`);
    await buildAndSendFullReceipt(order, items); // mesma função do pedido novo
    await supabase.rpc('complete_order_print', { p_order_id: orderId });
    return;
  }
}

// Só chama fail_order_print se REALMENTE não tem nada para imprimir
await supabase.rpc('fail_order_print', { p_order_id: orderId, p_error: 'no_items' });
```

### Critério

Pedido `extra` sem `delta_items` mas com `order_items > 0` deve **imprimir como recibo completo** em vez de falhar.

---

## BUG 2 — Após bridge cair (`Failed to fetch`), `claim_order_print` retorna `false` para sempre

### Evidência (network log, 02:38:48 → 02:39:35)

```
02:38:48  claim_order_print  → true
02:38:48  GET order_items     → [{"product_name":"Bovino","quantity":9,"subtotal":90.00,...}]
02:38:50  POST localhost:3001/print → Failed to fetch  (bridge offline)
02:38:51  defer_order_print  → 204
02:39:25  claim_order_print  → false   ← deveria voltar a true após defer
02:39:29  claim_order_print  → false   (outro pedido)
02:39:35  claim_order_print  → false
... e nunca mais sobe.
```

E o `requeue_stuck_print_jobs(p_seconds=90)` continua retornando `{"requeued": 0}` mesmo após 1min+ — sinal de que o pedido **não está em estado `printing` com `print_claimed_at` antigo**, está em `pending` mas algo bloqueia o claim.

### Hipóteses (em ordem de probabilidade)

1. **`defer_order_print` não limpa `print_claimed_at`**, então o `claim_order_print` enxerga um claim ativo recente e recusa.
2. **`defer_order_print` move o status para algo diferente de `pending`** (ex.: `deferred`, `error`) e o `claim_order_print` filtra só por `pending`.
3. **`print_status` ficou em `'failed'`** (pelo BUG 1 anterior do mesmo pedido) e o `claim_order_print` não pega `failed`.

### Como confirmar (rodar no SQL editor do Supabase)

```sql
SELECT id, table_name, print_status, print_claimed_at, print_last_error, updated_at
FROM orders
WHERE id IN (
  '29ca7d45-7cac-48a4-96c5-7012a8d3f759',
  '6f67e9e2-8531-4929-bbc7-a239dff6e24c',
  '639786a7-b56f-47cf-ae58-004841025291',
  'af10bb02-1659-4a7e-9fad-8bde59e11bdb'
)
ORDER BY updated_at DESC;
```

E inspecionar:

```sql
\df+ public.defer_order_print
\df+ public.claim_order_print
\df+ public.requeue_stuck_print_jobs
```

### Fix esperado (uma das opções)

**Opção A — corrigir `defer_order_print`** para deixar tudo limpo:
```sql
CREATE OR REPLACE FUNCTION public.defer_order_print(p_order_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE orders
  SET print_status = 'pending',
      print_claimed_at = NULL,
      print_last_error = 'bridge_offline_deferred',
      updated_at = now()
  WHERE id = p_order_id;
$$;
```

**Opção B — `claim_order_print` aceitar reclaim após X segundos** mesmo se `print_claimed_at` estiver setado:
```sql
-- dentro do claim, ao invés de WHERE print_claimed_at IS NULL:
WHERE (print_claimed_at IS NULL OR print_claimed_at < now() - interval '30 seconds')
```

**Opção C — `requeue_stuck_print_jobs` também varrer pedidos com `print_last_error LIKE '%bridge%'`** independente do status.

### Critério

Quando o bridge volta a responder, qualquer pedido com `print_status='pending'` deve ser reclaimado em ≤ 30s pelo worker e impresso. Hoje fica preso.

---

## BUG 3 (correlato) — Não há retry automático quando bridge volta

Mesmo que os bugs 1 e 2 sejam resolvidos, o `print-queue-worker` (`src/lib/print-queue-worker.ts`) só processa a **fila local** (`getPrintQueue()`), não os pedidos com `print_status='pending'` no banco.

Sugestão: adicionar no worker um tick que faz:

```ts
// A cada tick, se bridge online E houver pedidos pending no banco, dispara claim
const { data: pending } = await supabase
  .from('orders')
  .select('id')
  .eq('print_status', 'pending')
  .in('status', ['new', 'preparing', 'done', 'paid'])
  .order('created_at', { ascending: true })
  .limit(5);

for (const o of pending ?? []) {
  await tryClaimAndPrint(o.id);
}
```

Isso fecha o loop: bridge cai → defer → bridge sobe → worker pega pedidos pending e imprime.

---

## Resumo do que o Codex precisa fazer

| # | Onde | O quê |
|---|---|---|
| 1 | `global-order-runtime.ts` (path do claim → handler) | Quando `print_type='extra'` e `delta_items` vazio, fallback para imprimir como `full` usando `order_items`, em vez de chamar `fail_order_print` |
| 2 | RPC SQL `defer_order_print` ou `claim_order_print` | Garantir que após `defer`, o pedido pode ser reclamado em ≤ 30s |
| 3 | `print-queue-worker.ts` | Adicionar varredura de `orders.print_status='pending'` no tick (não só fila local) |

## Critério de aceite final

- Sistema rodando 30+ min sem parar de imprimir.
- Bridge desligar/ligar não trava pedidos.
- Pedido `extra` sem `delta_items` ainda assim imprime (recibo completo como fallback).
- Logs do worker mostram `retry ✓ pedido X` quando bridge volta.
