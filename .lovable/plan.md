

## Estoque com layout idêntico ao PALM

### Problema
A aba Estoque hoje agrupa por **categorias de estoque** (`bebidas`, `carnes`, `descartáveis`, `gás/carvão`, `limpeza`, `outros`) — então só aparecem 2 tabs porque quase tudo importado do cardápio cai em "bebidas" ou "carnes". Visual também difere do PALM (tabs do shadcn vs. tabs estilizadas do garçom).

### Solução
Replicar visualmente e estruturalmente o `MenuView` do PALM na tela de Estoque: mesmas 4 categorias do cardápio (**Refeições · Espetos · Bebidas · Cervejas**), mesmo estilo de tabs, mesmo grid de cards.

### Mudanças

**1. Categorias por cardápio, não por estoque**

Para itens **vinculados a produto** (`product_id != null`), usa a categoria do `products` (refeicoes/espetos/bebidas/cervejas). Para itens **soltos** (insumos sem vínculo, ex: carvão), agrupa numa categoria extra **"Insumos"**.

Resultado: tabs ficam exatamente as do PALM + "Insumos" no final (só aparece se houver item solto) + "Críticos" no começo.

**2. Tabs com visual do PALM**

Substituir `<Tabs>` do shadcn por barra de tabs igual à do `MenuView.tsx` (linhas 246-281):
- `flex overflow-x-auto no-scrollbar border-b border-border`
- Botão ativo: `text-foreground font-bold` + barra inferior `bg-brand-gradient`
- Inativo: `text-muted-foreground font-semibold`
- Badge de contagem por categoria (qtd de itens críticos na cor destrutiva, ou total na cor neutra)

**3. Cards no estilo PALM**

`StockCard.tsx` reescrito com o mesmo grid e estética do PALM:
- Grid: `grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-2`
- Card: `rounded-2xl border bg-card p-3 shadow-soft`, borda colorida indicando status (vermelho negativo/zero, amarelo baixo)
- Layout interno do card:
  - Nome do item (top, bold)
  - Estoque atual em destaque (`brand-gradient-text` quando ok; vermelho quando crítico) + "mín X"
  - Badge de status no canto superior direito (NEGATIVO / ZERADO / BAIXO / FORA DO CARDÁPIO)
  - Footer com 4 ícones-botão compactos: − Saída · + Entrada · ≡ Ajuste · ✎ Editar
- Tap longo / botão `History` discreto (ícone pequeno) movido pra dentro do menu Editar pra simplificar.

**4. Header alinhado ao PALM**

`Stock.tsx`:
- Mesmo padrão do MenuView: `glass-card`, busca com ícone à esquerda + botão limpar à direita, tabs logo abaixo.
- Botões "Re-importar" e "Novo" no topo (já existem) — manter.
- Resumo (`32 itens · 3 zerados...`) fica logo abaixo das tabs como faixa fina.

**5. Lógica de categorização (helper novo em `inventory.ts`)**

```ts
export function getDisplayCategory(
  item: InventoryItem,
  productCategoryById: Map<string, string>
): string {
  if (item.product_id) {
    const cat = productCategoryById.get(item.product_id);
    if (cat) return cat; // refeicoes / espetos / bebidas / cervejas
  }
  return "insumos";
}
```

`Stock.tsx` busca os produtos do cardápio (já tem `useMenuProductsForStock`) pra montar o map `product_id → category` e calcular `displayCategory` por item.

### Arquivos

**Editados**
- `src/pages/Stock.tsx` — tabs no estilo PALM, ordem fixa (Críticos, Refeições, Espetos, Bebidas, Cervejas, Insumos), header refeito.
- `src/components/stock/StockCard.tsx` — visual `rounded-2xl`, grid 150px, layout PALM-like, ícones compactos.
- `src/components/stock/StockList.tsx` — grid `auto-fill,minmax(150px,1fr)` em vez de `md:grid-cols-2 lg:grid-cols-3`.
- `src/lib/inventory.ts` — helper `getDisplayCategory` + constante `DISPLAY_CATEGORIES = ["refeicoes","espetos","bebidas","cervejas","insumos"]`.

### Como vai ficar

```text
┌──────────────────────────────────────┐
│ ← Estoque   [Re-importar] [+ Novo]   │
│ [🔍 Buscar...]                        │
│ [🚨 Críticos·5][Refeições·8][Espetos·12][Bebidas·22][Cervejas·6][Insumos·3] │
├──────────────────────────────────────┤
│ 51 itens · 2 negativos · 3 zerados   │
├──────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐    │
│ │Coca 2L │ │Linguiça│ │Carvão  │    │
│ │ 3 un   │ │ 0 kg   │ │ 8 kg   │    │
│ │mín 10  │ │ ZERADO │ │mín 5   │    │
│ │−+≡✎    │ │−+≡✎    │ │−+≡✎    │    │
│ └────────┘ └────────┘ └────────┘    │
└──────────────────────────────────────┘
```

### O que NÃO muda
- Schema, RPCs, lógica de movimentação, sincronização com cardápio, badge ESGOTADO no PALM, `OutOfStockConfirmDialog`, tab Críticos, importação automática.
- `STOCK_CATEGORIES` continua existindo (usado no `ItemFormDialog` como categoria interna do insumo); só a **visualização** da grade muda pra usar a categoria do cardápio.

