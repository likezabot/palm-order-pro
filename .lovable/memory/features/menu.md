---
name: Menu Categories
description: 4 categorias canônicas do cardápio usadas em todo o sistema
type: feature
---

## Categorias do cardápio (canônicas)
`refeicoes`, `espetos`, `bebidas`, `cervejas` — definidas em `src/lib/types.ts` (`CATEGORIES` / `CATEGORY_LABELS`). Tudo (formulários, bot Telegram, PALM) deve usar essas 4 chaves.

## Sem módulo de estoque
O módulo de estoque foi removido do site. Não existe mais `inventory_items`/`product_recipes` no código. Produtos só têm `active` (true/false) controlado no Admin — nenhuma marcação automática de ESGOTADO.
