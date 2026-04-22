

## Estoque com vínculo ao cardápio + alertas operacionais

### Resumo do comportamento novo
1. Estoque **pode ficar negativo** — saída/ajuste nunca bloqueia, só avisa em vermelho.
2. Quando item bate ≤ 0, **NUNCA esconde sozinho** do cardápio do garçom. Aparece um modal "Realmente acabou X?" com 2 ações: **Manter no cardápio** ou **Marcar como esgotado** (`active=false` no `products`).
3. Aba Estoque ganha tabs por categoria + seção dedicada **"Últimos 5 / Crítico"**.
4. Itens do cardápio (`products`) podem ser linkados a um item de estoque (`inventory_items`) para gestão unificada.

### 1. Schema — vínculo cardápio ↔ estoque

**Migração nova:**
- `inventory_items.product_id uuid NULL` — ID opcional pro produto do cardápio que esse item de estoque controla.
- Índice único parcial: um produto não pode ser controlado por dois itens de estoque.
- `apply_inventory_movement` retorna agora também `linked_product_id` e `linked_product_active` no JSON, para a UI saber se precisa abrir o modal de confirmação.

Nada destrutivo. Itens existentes ficam com `product_id = NULL` e continuam funcionando como insumo solto.

### 2. Hook novo `use-menu-products-for-stock.ts`
Lista os produtos do cardápio (`products`) que **ainda não têm** item de estoque vinculado. Usado no `ItemFormDialog` num select novo "Vincular a produto do cardápio (opcional)".

### 3. `ItemFormDialog` — vincular ao cardápio
- Novo campo: select "Produto do cardápio" (com busca) — opcional.
- Quando seleciona, pré-preenche `name`, `category` (mapeada de cardápio → categoria de estoque) e bloqueia o nome (read-only com nota "vinculado a [Produto]").
- Botão "Desvincular" se já tiver vínculo.

### 4. Importação rápida do cardápio
Botão **"Importar do cardápio"** no header da `Stock.tsx`. Abre um dialog `ImportFromMenuDialog`:
- Lista produtos do cardápio sem vínculo, agrupados por categoria, com checkboxes.
- Bulk-cria itens de estoque a partir dos selecionados (slug auto, `current_stock=0`, `min_stock=0`, vinculados).
- Resolve "evitar cadastro duplicado manual".

### 5. Modal "Realmente acabou?" — `OutOfStockConfirmDialog`

Disparado automaticamente após uma movimentação que deixa `current_stock <= 0` **e** o item tem `product_id` vinculado **e** o produto ainda está `active=true`.

```text
┌─────────────────────────────────────┐
│ ⚠ Realmente acabou Linguiça?        │
│                                     │
│ O estoque chegou a 0. Quer remover  │
│ do cardápio do garçom?              │
│                                     │
│ [Manter no cardápio] [Marcar esgotado]│
└─────────────────────────────────────┘
```

- "Manter no cardápio" → fecha, nada muda em `products`.
- "Marcar esgotado" → `UPDATE products SET active=false`. Item some do `MenuView` (que já filtra `active=true`). Toast: "Linguiça removida do cardápio".

Lógica fica em `MovementDialog.handleConfirm` — após o `apply.mutateAsync`, lê o retorno e dispara o modal se necessário.

### 6. Saída/ajuste sem bloqueio
- `MovementDialog`: o aviso "⚠ ficará negativo" continua, mas botão Confirmar **não é mais desabilitado**. Só pinta vermelho. Nenhuma mudança no SQL — `apply_inventory_movement` já permite negativo (não tem `CHECK >= 0`).

### 7. Reativar item no cardápio
No `StockCard`, se o item tem `product_id` vinculado e o produto está `active=false`, mostra badge **"FORA DO CARDÁPIO"** e botão pequeno **"Reativar no cardápio"** (faz `UPDATE products SET active=true`).

### 8. Tela de estoque reorganizada — `Stock.tsx`

Layout novo:

```text
┌─ Header ─────────────────────────────────┐
│ ← Estoque   [Importar cardápio] [+ Novo] │
│ [🔍 buscar...]                            │
├─ Tabs categoria ────────────────────────┤
│ [🚨 Críticos·7] [Todas] [Bebidas·12] ... │
├─ Resumo (sticky) ────────────────────────┤
│ 32 itens · 2 negativos · 3 zerados · 5 baixos │
├─ Grid por categoria ────────────────────┤
│  ... cards ...                           │
└──────────────────────────────────────────┘
```

- Tab **🚨 Críticos** (default quando vier `?filter=low`): junta negativos + zerados + os **5 itens com menor `current_stock - min_stock`** (margem mais apertada). Ordenação: negativos → zerados → baixos por gap. Badge no tab mostra a contagem.
- Tabs por categoria de estoque, igual ao `MenuView`.
- Filtro "só baixos" vira redundante, removido.

### 9. Status visual ampliado — `inventory.ts`

Novo status `"negative"`:
- `current_stock < 0` → "negative" (badge vermelho-escuro "NEGATIVO", borda vermelha pulsante).
- `current_stock === 0` → "zero" (igual hoje).
- `current_stock <= min_stock` → "low".

`StockCard` ganha o badge "NEGATIVO" e exibe valor com sinal (`-3 unidades`).

### 10. `StockSummaryCard` (Home) — incluir negativos
Adiciona contador de negativos no card resumo: `2 negativos · 3 zerados · 5 baixos`. Cor destrutiva quando há negativos.

### 11. Componente novo `CriticalStockSection`
Renderizado no topo da tab "Críticos" e também opcionalmente embed em outra tela futura. Lista até 5 itens mais críticos com botão direto "Repor" (atalho pra `MovementDialog` tipo "in").

### Arquivos

**Novos**
- `supabase/migrations/<ts>_inventory_link_products.sql` — coluna `product_id`, índice, retorno extendido da função.
- `src/components/stock/OutOfStockConfirmDialog.tsx`
- `src/components/stock/ImportFromMenuDialog.tsx`
- `src/components/stock/CriticalStockSection.tsx`
- `src/hooks/use-menu-products-for-stock.ts`

**Editados**
- `src/lib/inventory.ts` — status `"negative"`, helper de margem crítica, mapping categoria cardápio → estoque.
- `src/hooks/use-inventory.ts` — mutation `useToggleProductActive(productId, active)` pro confirm/reativar.
- `src/components/stock/StockCard.tsx` — badge negativo, badge "fora do cardápio", botão reativar.
- `src/components/stock/MovementDialog.tsx` — sem bloqueio quando negativo; após confirmar, dispara `OutOfStockConfirmDialog` se aplicável.
- `src/components/stock/ItemFormDialog.tsx` — campo de vínculo com produto do cardápio.
- `src/components/home/StockSummaryCard.tsx` — contador de negativos.
- `src/pages/Stock.tsx` — tabs por categoria + tab "Críticos" + botão Importar.

### Como cada requisito é atendido

- **Vínculo cardápio↔estoque**: `inventory_items.product_id` + `ItemFormDialog` + Importação em massa. Um produto pode ter no máximo um item de estoque.
- **Confirmação antes de remover**: `OutOfStockConfirmDialog` aparece automático quando estoque cruza zero pra baixo, só pra itens vinculados, e nunca remove sem clique explícito.
- **Alerta zerado/negativo**: novo status `"negative"` com cor destrutiva, badge no card, contagem no resumo da Home e na tab Críticos.
- **Últimos 5/baixos**: tab "🚨 Críticos" mostra negativos + zerados + 5 itens com menor margem (`current_stock - min_stock`), tudo numa tela só.
- **Operar sem estoque**: nada bloqueia saída/ajuste. Cardápio só some se o usuário confirmar no modal — caso contrário, garçom continua podendo lançar o item normalmente mesmo com estoque zero/negativo.

### O que NÃO muda
- Lógica de pedidos/PDV/caixa/impressão/realtime de `orders`. Nada subtrai do estoque automaticamente — venda no PDV não mexe em `inventory_items` (o usuário pediu confirmação manual). Reorder/baixa por venda fica fora deste escopo.
- Bot do Telegram (estrutura segue pronta, sem mudanças).

