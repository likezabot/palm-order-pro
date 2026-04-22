

# Vincular esgotamento de espetos a refeições derivadas + remover refeições do estoque

## Problema atual

1. **Refeições estão no estoque sem necessidade.** Hoje existem 4 itens em `inventory_items` na categoria `refeicoes` (Janta de costela bovina, Jantinha, Arroz 200g, Salada Un). Refeições são preparadas na hora — não faz sentido controlar estoque delas.
2. **Falta vínculo entre matéria-prima e prato.** Quando "Costela de boi (borboleta)" (espeto) zera no estoque, "Janta de costela bovina" (refeição) deveria automaticamente ficar ESGOTADA no PALM, mas não fica — não há ligação entre os dois.

Hoje só costela de boi precisa desse vínculo, mas a estrutura precisa ser flexível para futuros pratos derivados.

## Solução

### 1. Migration — remover refeições do estoque + nova tabela de receitas

**Limpeza:**
- Soft-delete (`is_active = false`) dos 4 itens de `inventory_items` com `category = 'refeicoes'`. Mantém histórico de movimentações intacto.
- Atualizar `auto_inventory_from_order_items` (trigger) para **ignorar produtos da categoria `refeicoes`** — não decrementa estoque ao vender uma refeição (já que refeição não tem mais estoque próprio).

**Nova tabela `product_recipes`:**
```sql
CREATE TABLE product_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,        -- prato derivado (ex: Janta de costela bovina)
  ingredient_product_id uuid NOT NULL, -- matéria-prima (ex: Costela de boi borboleta)
  created_at timestamptz DEFAULT now(),
  UNIQUE (product_id, ingredient_product_id)
);
```
RLS pública (mesmo padrão das outras tabelas POS).

**Seed inicial:** inserir 1 linha — `Janta de costela bovina` → `Costela de boi (borboleta)`.

### 2. Lógica de "esgotado por receita" (frontend)

Atualizar `src/hooks/use-product-stock-map.ts` e adicionar `useProductRecipes`:
- `useProductRecipes()` carrega todas as receitas (1 query, cache via React Query).
- `isProductEsgotado(stockMap, productId, recipes)`:
  1. Se o produto tem `inventory_item` próprio (vinculado direto) e estoque ≤ 0 → **esgotado**.
  2. Se o produto tem entradas em `product_recipes` → **esgotado se QUALQUER ingrediente** estiver com estoque ≤ 0.
  3. Caso contrário → não esgotado (refeições sem receita = sempre disponível).

Aplicar nos componentes que usam `isProductEsgotado`: `MenuView`, `GroupVariantDialog`, `EsgotadoConfirmDialog` etc.

### 3. UI — gerenciar receitas no Admin

Adicionar mini-painel no `ProductForm.tsx` (só quando `category = 'refeicoes'`):
```
Ingredientes do estoque (esgota junto)
[ + Adicionar ingrediente ]
• Costela de boi (borboleta)  [✕]
```
- Select com produtos que têm `inventory_item` vinculado (espetos/bebidas/cervejas com estoque).
- Ao salvar: insert/delete em `product_recipes`.

### 4. Bot Telegram

Categoria `refeicoes` somem do menu de estoque do bot automaticamente (já que os itens viram inativos). `wzListCategoriesWithCount` continua mostrando as 4 categorias, mas refeições aparecerá com `(0)` — ajustar para **suprimir categorias com 0 itens** no contexto do bot, mantendo a ordem canônica.

### 5. Estoque (web)

`src/lib/inventory.ts` — `STOCK_CATEGORIES` mantém as 4, mas `ItemFormDialog` ao criar novo item passa a alertar "Refeições não usam estoque — vincule via Receita no produto". Remover `refeicoes` das opções do select de categoria do form de item de estoque.

## Arquivos modificados

- **Nova migration SQL** — soft-delete refeições, criar `product_recipes`, seed costela, ajustar trigger `auto_inventory_from_order_items`.
- `src/hooks/use-product-stock-map.ts` — adicionar `useProductRecipes` + nova lógica `isProductEsgotado`.
- `src/components/palm/MenuView.tsx`, `GroupVariantDialog.tsx`, etc. — passar `recipes` no `isProductEsgotado`.
- `src/components/admin/ProductForm.tsx` — painel de receitas para refeições.
- `src/components/stock/ItemFormDialog.tsx` — remover `refeicoes` das opções.
- `supabase/functions/telegram-webhook/index.ts` — suprimir categorias com 0 itens.
- `.lovable/memory/features/menu.md` — documentar receitas.

## Observações

- **Compatibilidade:** vendas existentes não mudam — pedidos continuam funcionando; só o decremento automático de estoque deixa de ocorrer para refeições (que não tinham estoque útil mesmo).
- **Extensível:** depois fica fácil adicionar mais receitas (ex: Jantinha → Frango do espeto) sem mexer em código.
- **Independência mantida:** Costela suína e outros espetos continuam controlados individualmente; o vínculo é só onde houver receita cadastrada.

