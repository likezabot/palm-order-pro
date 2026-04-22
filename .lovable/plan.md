

## Badge "+N" nas abas de categoria

### Objetivo
Mostrar nas abas de categoria (Refeições, Espetos, Bebidas, Cervejas, Favoritos) um indicador discreto com a quantidade de itens já adicionados ao carrinho daquela categoria — para o garçom saber, sem trocar de aba, que tem coisas lá.

### Como funciona hoje
- `MenuView` já calcula `getQty` por produto a partir do `cart`.
- Cada `product.category` está em `CATEGORIES`. Variantes sintéticas de Porco (`porco-variant::*`) contam como `espetos`.
- Tabs renderizam só o label (ex: "Espetos"), sem badge.

### Mudança
**`src/components/palm/MenuView.tsx`** — adicionar contagem por categoria e renderizar badge no tab.

1. **Calcular contagens** com `useMemo` baseado em `cart` + `products`:
   - Para cada item do carrinho, achar o `product.category` correspondente:
     - Se `id` começa com `porco-variant::` → `espetos`.
     - Senão buscar `products.find(p => p.id === item.product.id)?.category`.
   - Somar `quantity` por categoria → `Record<string, number>`.
   - Total geral para o badge de "Favoritos" = soma de tudo (favoritos é virtual, mostra qualquer item adicionado).
   
   Alternativa mais simples para favoritos: contar só itens cujo `product.id` está em `favoriteIds`. **Vou usar essa** — bate com o que a aba mostra.

2. **Renderizar badge no tab** quando `qty > 0`:
   - Posição: à direita do label, inline (não absoluto, pra não cortar com `overflow-x-auto`).
   - Estilo discreto:
     - Tab inativa: pill pequena `bg-primary/15 text-primary` com `+N`.
     - Tab ativa: `bg-primary-foreground/20 text-primary-foreground` (fica legível sobre o gradiente laranja).
   - Formato: `+1`, `+2`, `+12` (sem cap).
   - Tamanho: `text-[11px] font-bold px-1.5 py-0.5 rounded-full ml-1.5`.

3. **Botão Favoritos** (ícone-only): badge sobreposto no canto superior direito, igual padrão dos cards (`absolute -top-1 -right-1`), pra não quebrar o layout do ícone estrela.

### Detalhes técnicos
- Sem novas queries — tudo derivado do `cart` que já está no escopo.
- `useMemo` com deps `[cart, products, favoriteIds]`.
- Não muda comportamento de cliques nem o restante da grade.
- Badges também aparecem quando o usuário está na aba ativa (consistência visual; ele vê os "+N" sumirem conforme limpa o carrinho).

### Resultado visual
```
[★ +3]  [Refeições +1]  [Espetos]  [Bebidas +2]  [Cervejas]
```

### Arquivos
- **Editado** `src/components/palm/MenuView.tsx` — `categoryQty` memo + badge nos tabs.

