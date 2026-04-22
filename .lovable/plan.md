

## Porco unificado: popup com estoque/preço no PALM + agrupamento visual no Admin e Estoque

### Problema
1. **Popup do Porco no PALM** mostra só o nome das 3 variantes — sem preço, sem badge ESGOTADO, sem confirmação se faltar estoque.
2. **Admin Cardápio**: "Porco", "Panceta suína" e "Costela suína" aparecem soltos, sem nenhuma indicação visual de que formam um grupo. Usuário não entende que controla o popup do garçom através desses 3 itens.
3. **Estoque**: mesmos 3 itens aparecem soltos, sem agrupamento — fica confuso saber qual representa o quê no popup.

### Solução
Manter os 3 produtos como entidades reais no banco (são editáveis, têm preço próprio, estoque próprio), mas:
- **PALM**: popup do Porco passa a renderizar **cards reais** com preço, badge ESGOTADO e respeita o fluxo de confirmação.
- **Admin** e **Estoque**: agrupar visualmente os 3 itens sob um banner/seção "🐷 Grupo Porco — popup do garçom" deixando claro que pertencem juntos.

### Mudanças

**1. `PorcoVariantDialog.tsx` — cards completos com preço + ESGOTADO**

Reescrever o dialog para receber a lista de produtos reais (Porco, Panceta, Costela) em vez de só strings, e usar o mesmo visual dos cards do PALM:

```text
┌─ Escolha o tipo de Porco ─────────┐
│ ┌─────────────────────────────┐   │
│ │ Porco                       │   │
│ │ R$ 12,00              + ADD │   │
│ └─────────────────────────────┘   │
│ ┌─────────────────────────────┐   │
│ │ Panceta suína   [ESGOTADO]  │   │
│ │ R$ 14,00         + Adicionar│   │
│ └─────────────────────────────┘   │
│ ┌─────────────────────────────┐   │
│ │ Costela suína               │   │
│ │ R$ 15,00              + ADD │   │
│ └─────────────────────────────┘   │
└────────────────────────────────────┘
```

Nova interface:
```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variants: Array<{ name: string; product: Product | null }>; // product=null se não cadastrado
  onPick: (variantName: string, product: Product) => void;
  isEsgotado: (productId: string) => boolean;
  getQty: (productId: string) => number;
}
```

- Variante sem produto cadastrado fica desabilitada com hint "Não cadastrado no admin".
- Variante esgotada renderiza badge ESGOTADO + texto "+ Adicionar" (em vez de "+ ADD") indicando que vai abrir confirmação.
- Badge de quantidade no canto superior direito quando já houver no carrinho.

**2. `MenuView.tsx` — passar produtos reais e roteamento de esgotado**

Substitui a chamada atual (que usa `porcoBase` único) por:
- Resolve os 3 produtos reais por nome (`PORCO_VARIANTS`) buscando em `products`.
- Passa array `variants` ao `PorcoVariantDialog`.
- `onPick(variantName, product)` chama o **mesmo `handleAdd(product)`** que já existe — assim a confirmação de esgotado dispara automaticamente para variantes vinculadas a estoque zerado, e o item entra no carrinho com o `id` real do produto (não mais id sintético `porco-variant::*`).
- Simplificação: como agora cada variante é um produto real, `categoryCounts` deixa de precisar do tratamento especial `porco-variant::*`. Mantemos só o badge `porcoQty` no card-pai somando as 3 variantes pelo `id` real.

**3. `menu-subgroups.ts` — manter constantes**

Sem mudança estrutural. `PORCO_VARIANTS` e `HIDDEN_ESPETO_NAMES` continuam guiando o que aparece escondido na grade do PALM e o que entra no popup.

**4. Admin Cardápio — banner de grupo Porco em `ProductsManager.tsx`**

Quando `activeCategory === "espetos"` e sem busca/filtro ativo, renderizar acima da grade um **callout/banner** discreto:

```text
🐷 Grupo Porco (popup do garçom)
Estes 3 itens aparecem juntos no popup ao tocar em "Porco" no PALM.
Edite preço/visibilidade individualmente — eles continuam controláveis aqui.
[Porco · ativo]  [Panceta suína · ativo]  [Costela suína · oculto]
```

- Renderiza como `<aside>` com `border-l-4 border-primary bg-primary/5 rounded-lg p-3`.
- Cada chip é clicável e rola/destaca o card correspondente na grade abaixo (scroll-into-view + ring temporário).
- Status (ativo/oculto) lido do `product.active`.
- Não duplica os cards na grade — eles continuam aparecendo normalmente abaixo.

**5. Estoque — banner de grupo Porco em `Stock.tsx`**

Quando a tab ativa for **Espetos**, renderizar o mesmo padrão de banner acima do grid:

```text
🐷 Grupo Porco (popup do garçom)
3 itens controlam o popup de variantes no PALM.
[Porco · 4 un]  [Panceta · 0 un · ZERADO]  [Costela · 8 un]
```

- Cada chip mostra estoque atual + status (negativo/zerado/baixo) com cor.
- Toque no chip rola até o `StockCard` correspondente e dispara um highlight (ring) por 1.5s.
- Identificação dos 3: filtra `inventoryItems` cujo produto vinculado tenha `name` em `PORCO_VARIANTS` (case-insensitive). Se algum não tiver item de estoque criado, chip aparece como "Porco · sem estoque" com botão "+ criar" que pré-abre o `ItemFormDialog` já vinculando o produto.

**6. Helper compartilhado novo: `src/lib/porco-group.ts`**

Centraliza a lógica de detecção/agrupamento do trio:
```ts
export const PORCO_GROUP_NAMES = ["porco", "panceta suína", "costela suína"] as const;

export function isPorcoVariant(productName: string): boolean { ... }
export function getPorcoGroupProducts(products: Product[]): Product[] { ... }
export function getPorcoGroupInventory(items: InventoryItem[], products: Product[]): InventoryItem[] { ... }
```

Usado por `MenuView`, `ProductsManager`, `Stock` e `PorcoVariantDialog`.

### Arquivos

**Editados**
- `src/components/palm/PorcoVariantDialog.tsx` — cards reais com preço, ESGOTADO, qty badge.
- `src/components/palm/MenuView.tsx` — passa produtos reais ao dialog; roteia `onPick` pelo mesmo `handleAdd` (ganha confirmação de esgotado de graça).
- `src/components/admin/ProductsManager.tsx` — banner "Grupo Porco" no topo da categoria Espetos.
- `src/pages/Stock.tsx` — banner "Grupo Porco" no topo da tab Espetos.

**Novos**
- `src/lib/porco-group.ts` — helpers de detecção/agrupamento.

### Como cada requisito é atendido

- **Popup do Porco mostra estoque/ESGOTADO + confirma**: cards reais no `PorcoVariantDialog` reaproveitam `isEsgotado` do `useProductStockMap`. Ao tocar uma variante esgotada, `onPick` chama `handleAdd` → abre `EsgotadoConfirmDialog` (mesmo fluxo dos outros itens).
- **Admin não fica "morto"**: os 3 cards continuam editáveis normalmente. Banner explica que eles alimentam o popup, então o admin sabe que mexer ali muda o garçom.
- **Estoque organizado**: banner agrupa os 3 visualmente, mostra estoque atual de cada um e dá atalho pra encontrar o card.
- **Sem id sintético**: variantes passam a entrar no carrinho com `product_id` real, então a venda vincula corretamente ao produto/estoque (preparando terreno pra futura baixa automática se quiser).

### O que NÃO muda
- Schema, RPCs, fluxo de movimentação, sincronização auto cardápio↔estoque, badge ESGOTADO nos cards normais do PALM, layout do `StockCard`, lógica de confirmação `OutOfStockConfirmDialog`.
- `HIDDEN_ESPETO_NAMES` continua escondendo Panceta/Costela da grade principal de Espetos no PALM (eles só aparecem via popup).

