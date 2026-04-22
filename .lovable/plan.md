

## Módulo de Estoque (web, pronto pra Telegram depois)

### Escopo
Aba **Estoque** independente do cardápio (`products`). Produtos de estoque são insumos/itens (ex: carvão, refrigerante lata, espeto de coração) que podem ou não bater com itens do cardápio. Estrutura nova, sem mexer em pedidos, PDV, impressão ou realtime.

### 1. Banco — duas tabelas novas

**`inventory_items`**
- `id` uuid pk
- `name` text not null
- `slug` text not null unique (gerado a partir do nome, normalizado sem acento/minúsculo — usado pelo bot pra matching rápido)
- `aliases` text[] default `'{}'` (apelidos: "coca", "coquinha", "coca lata")
- `category` text not null (ex: bebidas, carnes, descartáveis, gás/carvão, outros)
- `unit` text not null default `'unidade'` (unidade, kg, g, l, ml, caixa, pacote)
- `current_stock` numeric not null default 0 (numeric pra suportar 1.5kg)
- `min_stock` numeric not null default 0
- `is_active` bool not null default true
- `created_at`, `updated_at` timestamptz default now()

Índices: `slug` único, `is_active`, GIN em `aliases` pra lookup do bot (`WHERE 'coca' = ANY(aliases)`).

**`inventory_movements`**
- `id` uuid pk
- `item_id` uuid not null (sem FK rígida pra não bloquear delete; índice normal)
- `movement_type` text not null check in (`'in'`, `'out'`, `'adjustment'`)
- `quantity` numeric not null (sempre positivo; o tipo define o sinal)
- `note` text
- `source` text not null default `'manual'` check in (`'manual'`, `'telegram'`, `'pdv'`, `'system'`)
- `created_at` timestamptz default now()

Índice: `(item_id, created_at desc)` pra histórico rápido.

**RLS**: `public` ALL=true (sistema POS sem auth, igual `orders`/`products`).

**Função SQL `apply_inventory_movement(p_item_id, p_type, p_quantity, p_note, p_source)`** (SECURITY DEFINER):
- Trava a linha do item (`FOR UPDATE`).
- Calcula novo `current_stock`:
  - `in` → soma
  - `out` → subtrai (não bloqueia negativo, só registra; aviso vem na UI)
  - `adjustment` → seta `current_stock = quantity` (quantidade vira o valor absoluto novo)
- Atualiza `updated_at`.
- Insere registro em `inventory_movements`.
- Retorna `{ new_stock }`.

Toda mudança de estoque (UI ou Telegram futuro) passa por essa função → consistência garantida.

**Função auxiliar `find_inventory_item_by_text(p_text text)`** (já preparada pro bot):
- Normaliza input (lower, sem acento) e procura match exato em `slug` ou em `aliases`.
- Retorna primeira linha de `inventory_items` ou nulo.
- Não usada pela UI agora; fica pronta pro webhook.

### 2. Navegação

**`src/pages/Index.tsx`** — adiciona card **ESTOQUE** (ícone `Package`) no array `modes`, rota `/estoque`. Mantém ordem: Atendimento, PDV, Cozinha, **Estoque**, Admin.

**`src/App.tsx`** — registra `<Route path="/estoque" element={<Stock />} />`.

### 3. Tela de Estoque — `src/pages/Stock.tsx`

Layout single-page, mobile-first, sem tabs externas:

```text
┌─ Header ───────────────────────────────────────┐
│ ← Estoque              [+ Novo item]           │
│ [🔍 buscar...]  [Categoria ▾]  [☐ só baixos]   │
├─ Resumo ───────────────────────────────────────┤
│ 32 itens · 5 baixos · 2 zerados                │
├─ Lista (cards mobile / linhas no desktop) ─────┤
│ ┌──────────────────────────────────────────┐  │
│ │ Coca-cola lata          [BAIXO]          │  │
│ │ Bebidas · unidade                         │  │
│ │ 3 / mín 10                                │  │
│ │ [− Saída] [+ Entrada] [≡ Ajustar] [✎]    │  │
│ └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

Status visual via cor de borda esquerda + badge:
- `current_stock === 0` → badge destrutivo "ZERADO", borda vermelha
- `current_stock <= min_stock` (e > 0) → badge warning "BAIXO", borda amarela
- senão → sem badge, borda neutra

Busca: filtra por `name`, `slug` ou `aliases` (client-side, lista é pequena).

### 4. Componentes

- **`src/components/stock/StockList.tsx`** — grid responsivo (1 coluna mobile, 2 no md, 3 no lg). Recebe lista filtrada.
- **`src/components/stock/StockCard.tsx`** — card individual com nome, categoria, unidade, estoque atual/mínimo, badge de status, 4 botões (Entrada / Saída / Ajustar / Editar).
- **`src/components/stock/MovementDialog.tsx`** — dialog único reutilizado pelos 3 botões (Entrada/Saída/Ajuste). Campos: quantidade (input numérico grande, teclado decimal no mobile), nota opcional, botão confirmar grande. Mostra estoque antes/depois em preview.
- **`src/components/stock/ItemFormDialog.tsx`** — criar/editar item. Campos: nome, categoria (select), unidade (select), estoque inicial (só na criação), estoque mínimo, aliases (input com chips, separa por vírgula/Enter). Slug auto-gerado a partir do nome (mostrado read-only).
- **`src/components/stock/HistoryDialog.tsx`** — abre da Editar/menu, lista últimas 50 movimentações do item (tipo, qtd, nota, source, timestamp relativo).

### 5. Hooks e dados

- **`src/hooks/use-inventory.ts`**:
  - `useInventoryItems()` → React Query `["inventory-items"]`, `staleTime: 30s`, ordenado por nome.
  - `useInventoryMovements(itemId)` → query lazy quando o histórico abre.
  - `useApplyMovement()` → mutation que chama RPC `apply_inventory_movement` e invalida `["inventory-items"]` + histórico.
  - `useUpsertItem()` / `useDeactivateItem()` → mutations diretas em `inventory_items`.

- **Realtime opcional, leve**: subscribe em `inventory_items` (UPDATE) pra refletir movimentações feitas pelo bot/outro dispositivo. Mesmo padrão do `use-pdv-realtime`.

### 6. Resumo na Home

Em **`src/pages/Index.tsx`**, abaixo do bloco de instalação (e só se houver itens cadastrados), um mini-card discreto:

```text
📦 Estoque: 5 baixos · 2 zerados   →
```
Clique leva pra `/estoque?filter=low`. Se não houver alertas, não renderiza (mantém home limpa).

Implementado como `src/components/home/StockSummaryCard.tsx`, query rápida agregada (count de baixos/zerados).

### 7. Estrutura pronta pro Telegram (sem implementar agora)

Já fica pronto sem trabalho extra futuro:
- `aliases[]` + `slug` + função `find_inventory_item_by_text` → bot resolve "coca" / "coquinha" / "coca lata" no mesmo item.
- `apply_inventory_movement` aceita `p_source = 'telegram'` → quando o webhook for plugado, basta resolver o item e chamar essa função; nenhum cálculo de estoque no edge function.
- Movimentações ficam separáveis por `source` em relatórios futuros.

Quando for plugar no bot: `supabase/functions/telegram-webhook/index.ts` interpreta texto tipo "saiu 2 coca", chama `find_inventory_item_by_text('coca')`, depois `apply_inventory_movement(item_id, 'out', 2, null, 'telegram')`. Nenhuma mudança de schema necessária.

### 8. Arquivos

**Novos**
- `supabase/migrations/<ts>_inventory.sql` — tabelas, índices, RLS, funções.
- `src/pages/Stock.tsx`
- `src/components/stock/StockList.tsx`
- `src/components/stock/StockCard.tsx`
- `src/components/stock/MovementDialog.tsx`
- `src/components/stock/ItemFormDialog.tsx`
- `src/components/stock/HistoryDialog.tsx`
- `src/components/home/StockSummaryCard.tsx`
- `src/hooks/use-inventory.ts`
- `src/lib/inventory.ts` — helpers (slugify, status calc, label de unidade/source).

**Editados**
- `src/App.tsx` — rota `/estoque`.
- `src/pages/Index.tsx` — botão "ESTOQUE" + `StockSummaryCard`.

### O que NÃO muda
Pedidos, `products` do cardápio, PDV/caixa, impressão, kitchen, realtime de orders, pagamento, RLS existente. Estoque é um módulo isolado — mesmo se for desligado, nada quebra.

### Detalhes técnicos
- `current_stock` e `min_stock` como `numeric` (não integer) → suporta kg/litro fracionário sem refactor.
- `slug` único garante que o bot nunca fica em dúvida entre dois itens com mesmo nome.
- Função SQL centralizada → impossível ter divergência entre UI e bot na hora de aplicar movimentação.
- Sem FK forte em `inventory_movements.item_id` → permite manter histórico mesmo se item for excluído (bom pra auditoria); a UI filtra movimentações órfãs.
- `staleTime: 30s` + Realtime: app instalado (PWA) reflete mudanças do bot rapidamente sem polling agressivo.

