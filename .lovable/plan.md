

# Alinhar categorias do bot Telegram com o cardápio

## Problema

As categorias mostradas no bot (`bebidas (27)`, `carnes (14)`, `espetos (1)`) vêm da coluna `inventory_items.category`, que está **dessincronizada** do cardápio. O cardápio tem 4 categorias canônicas: `Refeições`, `Espetos`, `Bebidas`, `Cervejas` (definidas em `src/lib/types.ts`).

Resultados da inspeção:
- **Cardápio (`products`)**: refeicoes (4), espetos (11), bebidas (22), cervejas (5)
- **Estoque (`inventory_items`)**: bebidas (27), carnes (14), espetos (1) ← errado

Itens "carnes" no estoque deveriam ser "espetos" (são picanha, frango etc. usados nos espetos), e cervejas estão misturadas em "bebidas".

## Solução

### 1. Migration: normalizar categorias de `inventory_items`

Sincronizar com as categorias do cardápio:

- Para itens **vinculados a um produto** (`product_id IS NOT NULL`): copiar `products.category` direto. Resolve a maioria automaticamente.
- Para itens **não vinculados** (insumos puros): mover `carnes` → `espetos` (são matéria-prima dos espetos). Manter `outros` apenas se sobrar algo realmente fora do cardápio.
- Adicionar trigger `BEFORE INSERT/UPDATE` em `inventory_items` que, quando `product_id` for definido, copia automaticamente a categoria do produto vinculado. Garante que não dessincronize de novo no futuro.

### 2. Bot Telegram (`supabase/functions/telegram-webhook/index.ts`)

- Adicionar constante local `MENU_CATEGORIES = ["refeicoes", "espetos", "bebidas", "cervejas"]` e `MENU_CATEGORY_LABELS = { refeicoes: "Refeições", espetos: "Espetos", bebidas: "Bebidas", cervejas: "Cervejas" }` (espelha `src/lib/types.ts`, já que edge functions não importam de `src/`).
- Função `wzListCategoriesWithCount`: passar a **sempre listar as 4 categorias do cardápio na ordem canônica** (Refeições, Espetos, Bebidas, Cervejas), com a contagem real de itens ativos no estoque por categoria. Categorias com 0 itens aparecem com `(0)` em cinza ou são suprimidas (preferência: mostrar todas pra consistência visual com o cardápio).
- Botões usam o **label bonito** (`📂 Bebidas (22)`) em vez do slug (`📂 bebidas (22)`).
- Layout: 2 botões por linha igual hoje, mas seguindo a ordem fixa do menu (não ordem alfabética).
- Aplicar o mesmo label bonito em qualquer outro lugar do bot que mostre categoria (mensagens de operação em massa, item picker, etc.).

### 3. UI do app (`src/components/stock/*`)

- Aproveitar a normalização: telas de estoque (`StockList`, `ItemFormDialog`, `ImportFromMenuDialog`) já usam `CATEGORIES`/`CATEGORY_LABELS`. Confirmar que o select de categoria no formulário de item de estoque oferece apenas as 4 categorias do cardápio (não `carnes`/`outros`).
- Se houver hard-code de `"carnes"` ou `"outros"` em algum componente de estoque, trocar para usar `CATEGORIES` do `types.ts`.

## Arquivos modificados

- **Nova migration SQL** — UPDATE em `inventory_items` + trigger de auto-sync.
- `supabase/functions/telegram-webhook/index.ts` — categorias canônicas + labels bonitos.
- `src/components/stock/ItemFormDialog.tsx` (e similares se necessário) — usar `CATEGORIES` em vez de strings livres.
- `.lovable/memory/features/telegram-bot.md` — documentar alinhamento.

## Observações

- A migration é **idempotente** e segura: itens vinculados pegam categoria do produto; "carnes" sem vínculo viram "espetos".
- O trigger garante que daqui pra frente qualquer insert/update sempre fique alinhado.
- Comandos diretos (`entrada 10 coca`) continuam funcionando — busca por slug/alias não muda.

