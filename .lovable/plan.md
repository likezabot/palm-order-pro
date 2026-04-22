

## Limpar barra de categorias + badges por categoria

### Mudanças em `src/components/palm/MenuView.tsx`

**1. Remover Favoritos**
- Remove o botão "Favoritos" (estrela) da barra.
- Remove o branch `activeCategory === "favoritos"` em `filteredRaw` e na mensagem de empty state.
- Remove import `Star` e `useFavoriteProductIds` (e a query `favoriteIds`).
- Estado inicial continua `"espetos"`.

**2. Contador por categoria (dinâmico, escalável)**
Calculado via `useMemo` sobre `cart`, mapeando cada item à sua categoria:

```ts
const categoryCounts = useMemo(() => {
  const counts: Record<string, number> = {};
  for (const item of cart) {
    // Variantes sintéticas de Porco → categoria "espetos"
    const cat = item.product.id.startsWith("porco-variant::")
      ? "espetos"
      : (products.find(p => p.id === item.product.id)?.category ?? item.product.category);
    if (!cat) continue;
    counts[cat] = (counts[cat] ?? 0) + item.quantity;
  }
  return counts;
}, [cart, products]);
```

- Soma **quantidade total** (não tipos distintos).
- Atualiza automático em add/remove/update porque `cart` é a fonte.
- Funciona para qualquer categoria nova adicionada em `CATEGORIES` (escalável).
- Lida com produtos cuja `category` não veio populada no `CartItem.product` (ex.: itens carregados de pedido existente) usando lookup em `products`.

**3. Barra de categorias repensada**

Layout limpo, mais "tab" do que "pílula":

```text
┌────────────────────────────────────────────────┐
│  Espetos ③   Bebidas ②   Refeições   Cervejas │
│  ━━━━━━━━                                      │  ← underline na ativa
└────────────────────────────────────────────────┘
```

- Container: `flex gap-1 overflow-x-auto no-scrollbar border-b border-border`.
- Cada tab: `relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors`.
- Ativa: `text-foreground` + `::after` underline `bg-brand-gradient h-0.5` ancorada na base (via `<span>` absoluto).
- Inativa: `text-muted-foreground hover:text-foreground`.
- Badge inline ao lado do label (só aparece se `count > 0`):
  - `min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold inline-flex items-center justify-center`.
  - Ativa: `bg-primary-foreground text-primary`.
  - Inativa: `bg-primary/15 text-primary`.
- Sem borda em pílula, sem `bg-card` — tira o ruído visual e fica responsivo igual em mobile/desktop (scroll horizontal preservado).

**4. Não mexer**
- Lógica do carrinho: intacta.
- Cards de produto, badges de quantidade por item, subgrupos, Porco variant: intactos.
- `CartFab`, busca, header, dialogs: sem mudança.

### Arquivos
- **Editado** `src/components/palm/MenuView.tsx` — remoção do Favoritos, novo `categoryCounts`, nova barra de categorias com underline + badges.

### Resumo do contador
Mapeia `cart[i].product.id → categoria` (com fallback para `products` e tratamento especial das variantes de Porco), soma `quantity` por categoria. Memoizado, depende só de `cart` e `products`. Escala automático para qualquer categoria de `CATEGORIES`.

### Resumo da barra
- Era: pílulas com borda, fundo, gradiente forte na ativa, ícone de estrela separado.
- Fica: tabs flat com underline gradiente na ativa, badge numérico inline ao lado do nome, espaçamento uniforme, leitura imediata, sem poluição. Mantém scroll horizontal em telas estreitas.

