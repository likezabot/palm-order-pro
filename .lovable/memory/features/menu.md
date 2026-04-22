---
name: Menu & Recipes
description: Menu categories (4 canônicas) + product_recipes table linking dishes to stocked ingredients for auto-ESGOTADO
type: feature
---

## Categorias do cardápio (canônicas)
`refeicoes`, `espetos`, `bebidas`, `cervejas` — definidas em `src/lib/types.ts` (`CATEGORIES` / `CATEGORY_LABELS`). Tudo (estoque, bot Telegram, formulários) deve usar essas 4 chaves.

## Refeições NÃO têm estoque próprio
- Refeições (categoria `refeicoes`) são preparadas na hora.
- Items de `inventory_items` com category=`refeicoes` ficam `is_active=false`.
- Trigger `auto_inventory_from_order_items` ignora produtos com category=`refeicoes` (não dá baixa nem devolve).
- `ItemFormDialog` (estoque web) não permite criar item na categoria refeições.
- Bot Telegram: `wzListCategoriesWithCount` suprime categorias com 0 itens (refeições some).

## Receitas (`product_recipes`)
Tabela: `product_id` (prato derivado) → `ingredient_product_id` (matéria-prima do estoque).
Quando QUALQUER ingrediente zerar, o prato fica ESGOTADO no PALM via `isProductEsgotado(stockMap, productId, recipes)` em `src/hooks/use-product-stock-map.ts`.
Gerenciado no Admin via `ProductRecipesPanel` dentro de `ProductForm` quando `category=refeicoes`.

Seed inicial: **Janta de costela bovina → Costela de boi (borboleta)**.
