

## Fila de Pedidos (PDV/Caixa) — blocos quadrados unificados

Refatorar a área de **fila de pedidos** do `Pdv.tsx` e do `Cashier.tsx` para o mesmo padrão **grid de blocos compactos**, com troca de status em 1 clique e cronômetro de tempo no status atual. Sem mexer em banco, RPCs, realtime, impressão, pagamento ou seleção.

### 1. Mapeamento de status (sem alterar banco)

Os 3 status do banco continuam exatamente os mesmos (`new`, `preparing`, `done`), mas a UI usa o vocabulário pedido:

| Banco | Label UI | Cor chip |
|---|---|---|
| `new` | **AGUARDANDO** | azul |
| `preparing` | **EM PREPARO** | laranja |
| `done` | **PRONTO** | verde |

### 2. Regra "pedido novo já entra como EM PREPARO"

No `Pdv.tsx`, adicionar `useEffect` leve que, ao detectar pedidos com `status === "new"`, chama `supabase.rpc("update_order_status", { p_order_id, p_status: "preparing" })` em background, com guarda em `Set<string>` (uma vez por pedido). Resultado: do ponto de vista do operador, todo pedido novo aparece já como **EM PREPARO** (transição ~1s).

Sem alterar Palm, banco ou triggers.

### 3. Tempo no status atual

A coluna `orders.updated_at` já é renovada pela RPC `update_order_status` e por inserts. Usar **`updated_at`** como referência do "tempo na etapa":

- Hook existente `useElapsedTime(order.updated_at)` no chip principal do bloco.
- Label adapta-se ao status: "há 5min aguardando" / "há 8min em preparo" / "há 2min pronto".
- Ao avançar status, a RPC atualiza `updated_at` → cronômetro reinicia automaticamente.

### 4. Refatorar `OrderRow.tsx` para "bloco operacional"

Layout do bloco (compacto, ~180px altura mínima):

```text
┌─────────────────────────────┐
│ MESA 7        [EM PREPARO]  │  topo
│               [✓ Impresso]  │
├─────────────────────────────┤
│ 👤 João  ·  📦 4 itens      │  meio
│ ⏱ há 8min em preparo        │
├─────────────────────────────┤
│ R$ 87,50                    │  base
│ [✅ MARCAR PRONTO] [🖨][✎]  │
└─────────────────────────────┘
```

**Botão de avançar status (1 clique, no bloco):**
- `new` → "▶ INICIAR PREPARO" (transitório; auto-promovido)
- `preparing` → "✅ MARCAR PRONTO" (CTA verde)
- `done` no PDV → "💰 FECHAR" (abre painel/Caixa)
- Chama `supabase.rpc("update_order_status", ...)` + invalida query.
- `e.stopPropagation()` para não conflitar com clique de seleção do bloco.

**Borda lateral (urgência sobre etapa atual, baseada em `updated_at`):**
- normal: `border-l-transparent`
- alerta (>10min mesma etapa): `border-l-warning`
- crítico (>25min mesma etapa): `border-l-destructive` + `animate-pulse-active`
- Selecionado: `border-primary bg-primary/10` (mantido).

### 5. PDV (`src/pages/Pdv.tsx`) — fila vira grid uniforme

- Grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-fr`.
- `OrderRow` recebe novas props: `onAdvance(order)` e `statusSince` (= `order.updated_at`).
- Handler `handleAdvance` chama RPC + invalida `pdv-orders`.
- Painel direito de detalhes/pagamento: **inalterado**.
- `useEffect` de auto-promoção `new → preparing` (item 2).

### 6. Caixa (`src/pages/Cashier.tsx`)

- `OrderCard` interno usa `useElapsedTime(order.updated_at)` para o cronômetro principal.
- Trocar label `NOVO` → `AGUARDANDO`.
- Botão de avançar vira CTA principal quando `status !== "done"` ("✅ MARCAR PRONTO" / "▶ INICIAR PREPARO"); "💰 FECHAR" continua como CTA quando `done`.
- Grid mantido em `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr`.

### 7. Responsividade

- < 640px: 1 coluna, blocos `min-h-[180px]`.
- 640–1023px: 2 colunas.
- 1024–1279px: 3 colunas.
- ≥ 1280px: 4 colunas.
- Painel direito do PDV continua como sidebar `lg:` (sem mudança).

### Arquivos afetados (3)

- `src/components/pdv/OrderRow.tsx` — refatorar para bloco operacional, props `onAdvance`/`statusSince`, botão de avançar status, cronômetro em `updated_at`, label `AGUARDANDO`, borda por urgência da etapa.
- `src/pages/Pdv.tsx` — ajustar grid (auto-rows-fr + breakpoints), passar `onAdvance`/`statusSince` ao `OrderRow`, `useEffect` de auto-promoção, handler `handleAdvance`.
- `src/pages/Cashier.tsx` — `OrderCard` usa `updated_at` para tempo, label `AGUARDANDO`, botão avançar como CTA principal pré-pagamento.

### Sem alterações
- Banco, schema, RPCs (`update_order_status`, `pay_order`, `create_order_*`).
- Realtime (`usePdvRealtime`), polling do Caixa (`refetchInterval: 5000`).
- Impressão (`manualPrintOrder`), pagamento (`CloseOrder`, painel direito do PDV), Palm.
- Sem dependências novas.

### Resultado esperado

PDV e Caixa exibem a fila como **grid de blocos compactos** (1/2/3/4 colunas), cada bloco mostrando **mesa, garçom, itens, valor, status (AGUARDANDO/EM PREPARO/PRONTO) e tempo na etapa atual**. Status muda **com 1 clique no próprio bloco**. Pedidos novos viram **EM PREPARO** automaticamente. Cronômetro reinicia ao trocar de etapa. Pagamento, impressão, realtime e seleção continuam funcionando exatamente como antes.

