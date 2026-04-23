

# Remover toda lógica visual de esgotado no PALM

## Contexto

Na tela de Cervejas, "Antarctica Boa" aparece esmaecida (opacity-50) porque ainda existe lógica de "esgotado" no menu, baseada no estoque. Você pediu pra **não usar mais regras de estoque** nos itens — todos devem aparecer iguais, clicáveis, sem destaque visual de esgotado.

O comando do bot `acabou X` continua existindo (zera o `inventory_item.current_stock`), mas o PALM **ignora** essa informação. Visibilidade de produto = só `products.active` (controlado no Admin).

## Mudanças

### `src/components/palm/MenuView.tsx`
- Remover imports `useProductStockMap`, `useProductRecipes`, `isProductEsgotado`.
- Remover `stockMap`, `recipes`, função `isEsgotado`.
- Remover o `useMemo` `filtered` que reordena por esgotado — usar `filteredOrdered` direto.
- No card do produto: remover `const esgotado = isEsgotado(...)` e a classe condicional `opacity-50 cursor-not-allowed`. Sempre renderiza `border-border/40` (ou `border-foreground/20` quando `qty > 0`).
- Remover prop `isEsgotado` passada ao `<GroupVariantDialog>` (ou passar `() => false` pra manter a interface).

### `src/components/palm/GroupVariantDialog.tsx`
- Tirar a ordenação por `status` (esgotado pro fim) — manter ordem original.
- Remover a classe `opacity-60` quando `esgotado`.
- Remover a etiqueta `<span>esgotado</span>` à direita — sempre mostrar stepper/preço.
- Manter prop `isEsgotado` na interface mas ignorar internamente (mais simples não quebrar callers).

## O que NÃO muda

- Bot Telegram: comando `acabou X` continua zerando o estoque (registro fica salvo no banco pra uso futuro).
- Página `/estoque`, hooks de inventory, RPCs, tabelas — tudo intacto.
- `products.active` continua escondendo produto do cardápio quando desativado no Admin.
- Lógica de carrinho, stepper, badge de quantidade.

## Validação

1. Aba Cervejas: "Antarctica Boa" aparece com mesma cor/opacidade que "Skol 269ml".
2. Tap em qualquer produto adiciona ao carrinho — sem distinção entre esgotado/não esgotado.
3. Popup de variantes (grupos): linhas todas clicáveis, sem etiqueta "esgotado", ordem original preservada.
4. No bot, `acabou medalhão` continua respondendo `✅ Marquei "Medalhão" como esgotado` (silencioso no PALM).

