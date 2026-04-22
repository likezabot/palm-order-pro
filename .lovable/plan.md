

## Sistema de grupos genérico no Admin Cardápio

### Problema atual

Hoje só existe **um grupo hard-coded**: "Porco". Para criar um novo grupo (ex: "Refrigerantes 350ml" agrupando Coca/Guaraná/Sprite no popup, ou "Combo Cerveja"), precisa mexer em código. Além disso:

- Adicionar produto no Admin não tem fluxo claro de "criar grupo novo".
- O seletor "Grupo / Popup" só lista Porco e só aparece em Espetos.
- Não há tela para gerenciar grupos (renomear, excluir, mudar ícone).

### Solução: grupos dinâmicos por categoria

Transformar grupos em entidades de primeira classe, salvas em `settings`, criáveis direto do formulário de produto.

**1. Estrutura de dados (sem mudar schema)**

Nova chave em `settings`:
```json
key: "product_groups"
value: [
  {
    "id": "porco",
    "name": "Porco",
    "icon": "🐷",
    "category": "espetos",
    "trigger_product_name": "Porco",
    "member_names": ["Porco", "Panceta suína", "Costela suína"]
  },
  {
    "id": "refri-350",
    "name": "Refri 350ml",
    "icon": "🥤",
    "category": "bebidas",
    "trigger_product_name": "Refri 350ml",
    "member_names": ["Coca-Cola 350ml", "Coca-Cola Zero 350ml"]
  }
]
```

- `trigger_product_name`: produto-âncora que aparece na grade do PALM com selo `GRUPO` e abre o popup.
- `member_names`: produtos escondidos da grade que aparecem dentro do popup.
- Nomes funcionam como ID lógico (case/acento-insensível via `norm()`).

**2. Formulário de produto reformulado (`ProductForm.tsx`)**

Substituir o atual seletor binário "Nenhum / Grupo Porco" por seletor completo:

```
Categoria: [Refeições] [Espetos] [Bebidas] [Cervejas]

Grupo / Popup (opcional):
  ( ) Nenhum — item normal na grade
  ( ) 🐷 Porco (existente)
  ( ) 🥤 Refri 350ml (existente)
  ( ) ➕ Criar novo grupo…
```

- Lista todos os grupos da categoria atual (filtra `category === selectedCategory`).
- "Criar novo grupo" abre mini-form inline:
  - Nome do grupo (ex: "Refri 350ml")
  - Ícone (input emoji opcional, default 📦)
  - Checkbox "Este produto é o gatilho do grupo?" (se sim, vira `trigger_product_name`)
- Ao salvar produto, se grupo selecionado, adiciona `name` ao `member_names` do grupo escolhido (e cria o grupo se for novo).

**3. Refatoração `porco-group.ts` → `product-groups.ts`**

Generaliza a lógica:
```ts
export interface ProductGroup {
  id: string;
  name: string;
  icon: string;
  category: string;
  trigger_product_name: string;
  member_names: string[];
}

export function useProductGroups(): { data: ProductGroup[] }
export function useGroupForCategory(category: string): ProductGroup[]
export function getHiddenProductNames(groups: ProductGroup[]): string[]
export function findGroupByTrigger(name: string, groups: ProductGroup[]): ProductGroup | null
export function findGroupForProduct(productName: string, groups: ProductGroup[]): ProductGroup | null
export async function upsertGroup(group: ProductGroup): Promise<void>
export async function addProductToGroup(groupId: string, productName: string): Promise<void>
```

`PORCO_GROUP_NAMES` e `addPorcoExtraName` viram wrappers de retro-compat (chamam o novo helper apontando pro grupo "porco" seedado).

**4. PALM — gatilho dinâmico de qualquer grupo (`MenuView.tsx`)**

Em vez de checar `name === "Porco"`, varre `useProductGroups()`:

- Para cada grupo cuja `category === activeCategory`, marca o produto `trigger_product_name` com selo `{icon} GRUPO` + "{N} variantes".
- Esconde da grade todos os `member_names` dos grupos da categoria (exceto o trigger).
- Ao tocar no trigger, abre `GroupVariantDialog` (renomeado, antigo `PorcoVariantDialog`) recebendo o grupo + lista de produtos resolvidos.

`GroupVariantDialog` mantém a UX atual (cards reais com preço, ESGOTADO, qty badge), só fica genérico via props.

**5. Banners genéricos no Admin e Estoque**

`PorcoGroupBanner.tsx` vira `ProductGroupBanner.tsx` — recebe um grupo como prop. `ProductsManager` e `Stock` mapeiam todos os grupos da categoria ativa e renderizam um banner por grupo (empilhados).

**6. Tela de gerenciar grupos (`GroupsManager.tsx` no Admin)**

Nova subseção em `Admin → Cardápio` (acima da grade de produtos): botão "Gerenciar grupos". Abre dialog com:

- Lista de todos os grupos com ícone, nome, categoria, contagem de membros.
- Editar (nome, ícone, trocar trigger).
- Excluir grupo (não apaga produtos — só remove o agrupamento; produtos voltam a aparecer soltos na grade).
- Adicionar/remover membros (multiselect dos produtos da categoria).

### Migração de dados

Seed inicial em `settings`:
```sql
INSERT INTO settings (key, value)
VALUES ('product_groups', '[{
  "id": "porco",
  "name": "Porco",
  "icon": "🐷",
  "category": "espetos",
  "trigger_product_name": "Porco",
  "member_names": ["Porco", "Panceta suína", "Costela suína"]
}]'::text)
ON CONFLICT (key) DO NOTHING;
```

Migração runtime: ao carregar, se houver `porco_group_extra_names` antigo, mescla automaticamente no grupo "porco" e marca para limpeza.

### Arquivos

**Editados**
- `src/components/admin/ProductForm.tsx` — seletor genérico de grupo + criar inline.
- `src/components/admin/ProductsManager.tsx` — banners por grupo; botão "Gerenciar grupos".
- `src/components/palm/MenuView.tsx` — gatilhos dinâmicos por grupo.
- `src/components/palm/PorcoVariantDialog.tsx` → renomeado `GroupVariantDialog.tsx`, props genéricas.
- `src/components/admin/PorcoGroupBanner.tsx` → renomeado `ProductGroupBanner.tsx`.
- `src/components/stock/PorcoGroupBanner.tsx` → renomeado `ProductGroupBanner.tsx` (versão estoque).
- `src/pages/Stock.tsx` — itera grupos da categoria.
- `src/lib/porco-group.ts` → renomeado/expandido `product-groups.ts` (mantém exports legados).

**Novos**
- `src/components/admin/GroupsManager.tsx` — dialog de CRUD de grupos.
- Migração SQL: seed do grupo "porco" em `settings.product_groups`.

### Como cada requisito é atendido

- **"Adicionar produto no admin reflete em tudo"**: já reflete (PALM/Estoque/Cozinha leem do mesmo `products` via realtime). Reforço: ao adicionar/remover membro de grupo, também invalida `useProductGroups` → PALM atualiza popup em tempo real.
- **"Criar grupos dentro das categorias"**: seletor no formulário com opção "➕ Criar novo grupo" + tela dedicada de gerenciamento.

### O que NÃO muda

- Schema de tabelas (`products`, `inventory_items`, `orders`).
- Lógica de carrinho, impressão, ESGOTADO, RLS.
- Categorias permanecem as 4 (Refeições/Espetos/Bebidas/Cervejas) — grupos são uma camada **dentro** de cada categoria.
- Funcionalidade atual do Porco continua igual (vira só o primeiro grupo seedado).

