
# Plano — Grupos no cardápio público + esgotado independente

## Objetivo
1. No cardápio público, **agrupar variantes** (ex.: Coca-Cola 220ml / 600ml / 2L vira **1 card "Coca-Cola"** que abre um sheet com as opções), reusando os **mesmos `product_groups`** já cadastrados no Palm.
2. Permitir **marcar esgotado de forma independente** entre Palm (salão) e Cardápio Online (delivery/retirada) — hoje o `is_sold_out` é único e esgota nos dois ao mesmo tempo.
3. **Manter intacto** o layout de Refeições (lista com foto pequena) e Espetos (grid com foto grande). Só Bebidas/Cervejas (e qualquer outra com grupo) ganham comportamento agrupado.

## Restrições absolutas
- Nada de mexer em pedidos, checkout, carrinho (lógica), impressão, bridge, Electron, EXE, `print_jobs`, payloads ou rotas.
- A leitura de `product_groups` continua exatamente igual no Palm (mesma chave em `settings`).
- O sheet apenas adiciona itens via `cart.add(product, 1, "")` (mesmo handler já usado).

---

## Parte 1 — Esgotado independente (Palm vs Online)

### Migração SQL
Adicionar **uma única coluna** em `products`:

```sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_sold_out_online boolean NOT NULL DEFAULT false;
```

**Comportamento:**
- `is_sold_out` (já existia) → continua controlando o **Palm/salão** (sem mudanças no Palm).
- `is_sold_out_online` (novo) → controla **só o cardápio público**.
- Defaulta `false`, então **nada quebra**: produtos atuais começam disponíveis online (igual antes).

### Admin (`ProductForm.tsx` / `ProductsManager.tsx`)
- Adicionar **um segundo switch** ao lado do "Esgotado" atual:
  - `Esgotado no salão (Palm)` → `is_sold_out`
  - `Esgotado no delivery/online` → `is_sold_out_online`
- O badge da lista de produtos passa a mostrar os dois estados de forma clara.
- Telegram bot e fluxos do Palm continuam mexendo só em `is_sold_out` (zero impacto).

### Cardápio público (`src/lib/public-menu.ts`)
- Em `fetchPublicProducts`, selecionar também `is_sold_out_online` e mapear para o campo `is_sold_out` do tipo `PublicProduct` usando OR lógico:
  ```ts
  is_sold_out: row.is_sold_out || row.is_sold_out_online
  ```
  Assim, qualquer um dos dois esgota no público — mas no Admin você consegue desligar **só o do salão** sem afetar o online (ou vice-versa). Toda a UI pública continua usando o mesmo campo `is_sold_out`, sem mudança de tipos a jusante.

---

## Parte 2 — Grupos de variantes no cardápio público

### Helper novo: `src/lib/public-menu-groups.ts`
Reusa as funções já existentes em `src/lib/product-groups.ts` (`fetchGroups`, `resolveGroupMembers`, `getHiddenProductNames`), expostas via um hook `usePublicProductGroups()` (mesma `queryKey: ["settings", "product_groups"]` — cache compartilhado, zero requisição extra).

Função utilitária:
```ts
buildCategoryEntries(products, groups, categorySlug) → Array<
  | { kind: "product"; product: PublicProduct }
  | { kind: "group"; group: ProductGroup; trigger: PublicProduct; variants: PublicProduct[] }
>
```
- Esconde os `member_names` da categoria (exceto o trigger).
- O trigger vira um "card de grupo" com preço "a partir de R$ X,XX".
- Variantes esgotadas online ficam riscadas/desabilitadas dentro do sheet, mas o card do grupo continua aparecendo enquanto pelo menos uma variante estiver disponível.

### Sheet de variantes: `src/components/public-menu/PublicGroupVariantSheet.tsx` (novo)
- Baseado no `Sheet` (mobile-first, abre de baixo) usando o `ui/sheet` que já existe.
- Cabeçalho: nome do grupo + descrição opcional do trigger.
- Lista de variantes com nome + preço + botão "+" (mesmo `QuickAddButton` do `ProductCard`).
- Variante esgotada → badge "Esgotado" e botão desabilitado.
- Ao tocar no "+", chama `cart.add(variantProduct, 1, "")` exatamente como o `quickAdd` atual.
- Sem novos toasts (respeita a remoção feita anteriormente).

### Renderização (`src/pages/PublicMenu.tsx`)
- Onde hoje renderiza `products.filter(p => p.category === slug)`, passar a iterar `buildCategoryEntries(...)` e:
  - `kind: "product"` → `<ProductCard ...>` igual hoje (Refeições/Espetos seguem 100% iguais — categorias sem grupo geram só entradas `product`).
  - `kind: "group"` → novo `<ProductCard variant="group" priceLabel="a partir de R$ X,XX" onClick={() => setOpenGroup(...)}>`. O ProductCard ganha uma prop opcional `priceLabel` (string que sobrescreve a renderização do preço) e uma prop opcional `trailingHint` (mostra "›" indicando que abre algo). Sem mudar nenhum dos layouts atuais — só usado quando `priceLabel` é informado.
- Estado local `openGroup` controla o sheet.

### Resultado visual (mobile, 441×754)
- **Bebidas** vira: 1 linha "Coca-Cola — a partir de R$ 5,00 ›", 1 linha "Coca-Cola Zero — a partir de R$ 5,00 ›", "Fanta", "Guaraná" etc. Mesma estética premium (sombra warm, foto pequena à direita do trigger).
- **Cervejas** idem: "Skol — a partir de R$ 4,00 ›" abre 269ml/600ml.
- **Refeições** e **Espetos**: **inalterados** (não têm grupos cadastrados → tudo cai em `kind: "product"`).

---

## Arquivos afetados

### Migração
- `supabase/migrations/<timestamp>_add_is_sold_out_online.sql` (nova coluna).

### Admin (visual + 1 campo de form)
- `src/components/admin/ProductForm.tsx` — adicionar switch "Esgotado no delivery/online".
- `src/components/admin/ProductsManager.tsx` — exibir os dois badges de esgotado.

### Cardápio público
- `src/lib/public-menu.ts` — incluir `is_sold_out_online` na query e no merge OR.
- `src/lib/public-menu-groups.ts` — **novo**, reusa `product-groups.ts`.
- `src/components/public-menu/PublicGroupVariantSheet.tsx` — **novo**.
- `src/components/public-menu/ProductCard.tsx` — adicionar props opcionais `priceLabel` e `trailingHint` (sem mexer no comportamento atual).
- `src/pages/PublicMenu.tsx` — substituir o filter direto por `buildCategoryEntries` + estado `openGroup` + render do sheet.

**Não tocados:** Palm, PDV, Cashier, Kitchen, Admin de Grupos (`GroupsManager`), `print-*`, `bridge/*`, edge functions, `cart` (lógica), `checkout`, rotas.

---

## Testes (após implementação)
1. Abrir cardápio público no mobile → Bebidas mostra "Coca-Cola" (1 card) em vez de 6 linhas separadas.
2. Tocar em "Coca-Cola" → sheet abre com 220ml/600ml/2L + Zero 220ml/600ml/2L com preços e botão +.
3. Adicionar 1× Coca 600ml → carrinho FAB mostra 1 item, valor R$ 8,00. Fechar sheet, abrir carrinho → item correto.
4. Refeições e Espetos → **idênticos** ao print atual (sem regressão).
5. No Admin, marcar "Coca 600ml — esgotado no delivery" → no público a variante aparece riscada no sheet; no Palm continua disponível.
6. Marcar "esgotado no salão" no Palm → Palm bloqueia, público continua disponível.
7. Marcar os dois → esgota nos dois lados.
8. Build TypeScript passa, testes existentes (incl. WCAG do MenuHero) seguem passando.

## Confirmações finais
- ✅ Sem alteração em pedidos, checkout, impressão, bridge, Electron, EXE, `print_jobs` ou payloads.
- ✅ Reusa `product_groups` existentes (você cadastra/edita uma vez no Admin do Palm e vale para os dois).
- ✅ Esgotado fica **independente** Palm × Online via nova coluna `is_sold_out_online`.
- ✅ Layout de Refeições e Espetos preservado pixel a pixel.
