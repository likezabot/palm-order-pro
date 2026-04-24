

# Remover completamente o módulo de Estoque

## O que será removido

### 1. Página e rota
- Deletar `src/pages/Stock.tsx`
- Remover rota `/estoque` em `src/App.tsx`

### 2. Componentes de estoque
Apagar a pasta inteira `src/components/stock/`:
- `StockCard.tsx`, `StockList.tsx`, `CriticalStockSection.tsx`
- `HistoryDialog.tsx`, `ImportFromMenuDialog.tsx`, `ItemFormDialog.tsx`
- `MovementDialog.tsx`, `OutOfStockConfirmDialog.tsx`
- `ProductGroupBanner.tsx`

### 3. Card de resumo na Home
- Deletar `src/components/home/StockSummaryCard.tsx`
- Remover seu uso em `src/pages/Index.tsx`

### 4. Hooks relacionados
- `src/hooks/use-inventory.ts`
- `src/hooks/use-menu-products-for-stock.ts`
- `src/hooks/use-auto-sync-menu-to-stock.ts`
- `src/hooks/use-product-stock-map.ts`

### 5. Lógica/utilidades
- `src/lib/inventory.ts`
- Testes: `src/lib/__tests__/inventory.test.ts`

### 6. Integração no Palm (cardápio)
- Remover destaques de “ESGOTADO” e o uso de `useProductStockMap` / `isProductEsgotado` em `src/components/palm/MenuView.tsx` e onde mais aparecer.
- Remover o `OutOfStockConfirmDialog` do fluxo do carrinho.

### 7. Admin
- Remover `ProductRecipesPanel` do `ProductForm` (receitas existem só por causa do estoque).
- Deletar `src/components/admin/ProductRecipesPanel.tsx`.

### 8. Memórias
- Remover `mem://features/menu` (parte de receitas/estoque) ou reescrever sem menção a estoque.

## O que NÃO será mexido (banco)

As tabelas `inventory_items`, `inventory_movements`, `stock_movements`, `product_recipes` e os triggers `auto_inventory_from_order_items` / `queue_stock_alert` / `queue_stock_in` continuam no banco. Ficam órfãos mas inertes — nenhum código no site lê ou escreve neles. Isso evita risco de migration destrutiva sem você pedir.

Se quiser, num próximo passo eu apago tudo isso via migration (drop triggers + drop tables). Só me avisa.

## Resultado

- Some o card de estoque da Home.
- Some a rota `/estoque`.
- Cardápio do Palm não marca mais nada como ESGOTADO — todo produto ativo aparece disponível.
- Admin perde a aba de receitas dos pratos.
- Bridge, impressão, pedidos, caixa, Telegram: intactos.

