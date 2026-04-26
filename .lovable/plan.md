
## Objetivo

Estender a aba **Personalização** com controles **por categoria**, permitindo que cada categoria do cardápio público tenha seu próprio layout, proporção de imagem, estilo de card e ordem de produtos — sobrescrevendo as configurações globais.

⚠️ **Nada relacionado à impressão, bridge, EXE ou print_jobs será tocado.**

---

## 1. Banco de dados (migration)

Adicionar **uma única coluna JSONB** em `public_menu_settings`:

```sql
ALTER TABLE public_menu_settings
  ADD COLUMN IF NOT EXISTS category_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Formato do JSON (chave = slug da categoria):
```json
{
  "bebidas":   { "layout": "grid-3", "image_aspect": "square", "card_style": "compact" },
  "refeicoes": { "layout": "list",   "image_aspect": "wide",   "card_style": "detailed" }
}
```

Campos opcionais por categoria (se ausente → usa o global):
- `layout`: `"list" | "grid-2" | "grid-3"`
- `image_aspect`: `"square" | "wide" | "tall"`
- `card_style`: `"compact" | "detailed"` (compact = sem imagem grande/sem descrição; detailed = padrão atual)

**Atualizar a RPC** `admin_update_public_menu_settings` para aceitar `p_category_overrides jsonb` (opcional, se null mantém o atual).

---

## 2. Frontend — Aba Personalização

**Arquivo:** `src/components/admin/PublicMenuCustomizer.tsx`

### 2a. Nova sub-aba "Por categoria"
Adicionar `<TabsTrigger value="por-categoria">Por categoria</TabsTrigger>` ao lado de "Categorias".

Conteúdo: para cada categoria visível, um card colapsável com:
- Select **Layout**: Lista / Grade 2 col / Grade 3 col / *Usar padrão*
- Select **Proporção da imagem**: Quadrada / Larga / Alta / *Usar padrão*
- Select **Estilo do card**: Compacto / Detalhado / *Usar padrão*
- Botão "Resetar esta categoria"

Salva tudo num único `category_overrides` via RPC.

### 2b. Reordenar produtos por categoria
Dentro de cada card colapsável, abaixo dos selects, lista drag-and-drop dos produtos daquela categoria (`@dnd-kit`, mesmo padrão já usado em `CategoriesPanel`).

Ao salvar, chama uma nova RPC simples:
```sql
admin_reorder_products(p_ids uuid[], p_orders int[])
```
que faz `UPDATE products SET display_order = ...`.

---

## 3. Frontend — Renderização do menu público

**Arquivo:** `src/pages/PublicMenu.tsx`

No bloco que renderiza cada categoria (linhas ~292-321), substituir as constantes globais por uma resolução por categoria:

```ts
const ov = settings?.category_overrides?.[cat.slug] ?? {};
const catLayout  = ov.layout       ?? (layoutMode === "grid" ? "grid-2" : "list");
const catAspect  = ov.image_aspect ?? imageAspect;
const catStyle   = ov.card_style   ?? "detailed";
const gridClass =
  catLayout === "grid-3" ? "grid grid-cols-2 gap-3 sm:grid-cols-3"
  : catLayout === "grid-2" ? "grid grid-cols-2 gap-3"
  : "grid grid-cols-1 gap-3";
```

Passar `catAspect` e `catStyle` para `<ProductCard />`.

### ProductCard
**Arquivo:** `src/components/public-menu/ProductCard.tsx`

Adicionar prop `cardStyle?: "compact" | "detailed"`. Quando `compact`:
- Esconde imagem grande (mostra só miniatura ou nenhuma)
- Esconde descrição
- Reduz padding

Sem alterar nada no resto do fluxo (clique → `ProductDetailSheet` continua igual).

---

## 4. Tipos

**Arquivo:** `src/lib/public-menu.ts`

Adicionar ao tipo `PublicMenuSettings`:
```ts
category_overrides: Record<string, {
  layout?: "list" | "grid-2" | "grid-3";
  image_aspect?: "square" | "wide" | "tall";
  card_style?: "compact" | "detailed";
}>;
```
Default: `{}`. Incluir no `select` da query e no fallback inicial.

---

## Arquivos que serão alterados

✅ Permitidos:
- `supabase/migrations/<novo>.sql` (coluna + RPC)
- `src/lib/public-menu.ts` (tipos + select)
- `src/components/admin/PublicMenuCustomizer.tsx` (nova sub-aba + reordenação)
- `src/pages/PublicMenu.tsx` (resolver overrides por categoria)
- `src/components/public-menu/ProductCard.tsx` (suporte a `cardStyle`)

🚫 **Não serão tocados:** qualquer arquivo de impressão, bridge, electron, print_jobs, print-service, thermal-printer, receipt-* etc.

---

## Como testar

1. Admin → Personalização → **Por categoria** → expandir "Bebidas" → escolher "Grade 3 col" + "Quadrada" + "Compacto" → Salvar.
2. Abrir o cardápio público → Bebidas aparece em 3 colunas com cards menores.
3. Outras categorias permanecem com o layout global.
4. Arrastar produtos dentro da categoria → recarregar → ordem mantida.
5. Reset de categoria → volta ao global.
