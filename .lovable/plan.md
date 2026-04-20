

## Compactar lista do carrinho + corrigir itens duplicados

Dois ajustes na tela de revisão da Mesa (OrderReview):

### 1. Espaçamento menor entre os itens
Atualmente cada `CartItemRow` é um cartão com `p-4` (16px interno) e a lista usa `gap-3` (12px) + `p-3` no container. Visualmente "respira demais" — usuário quer compacto.

Mudanças em `src/components/palm/OrderReview.tsx`:
- Container da lista: `gap-3 p-3` → `gap-2 p-2`

Mudanças em `src/components/palm/CartItemRow.tsx`:
- Card: `p-4` → `p-2.5`
- `mt-2` do input observação → `mt-1.5`
- `mt-2` do botão REMOVER → `mt-1.5`
- Tag "POR JACIR": `mt-1` → `mt-0.5`

Resultado: cada card fica ~30% mais baixo, lista comprimida, ainda touch-friendly (botões +/- continuam 36px).

### 2. Bug: mesmo produto/garçom aparecendo em linhas separadas
Nas screenshots vejo "Bovino POR JACIR" + "Skol POR JACIR" + "Bovino POR JACIR" como 3 cards distintos, quando deveria ser 2 cards (Bovino x2, Skol x1). A dedupe no `loadOrder` falha quando os `waiter_name` vêm normalizados diferente (ex.: `"Jacir"` vs `"jacir"` vs `null`).

Correção em `src/hooks/use-palm-cart.ts`, função `loadOrder`:
- Normalizar a chave de dedupe usando `(waiter_name || "").trim().toUpperCase()` para que variações de caixa/espaço/null não criem entradas separadas.
- Mesma normalização precisa ser aplicada na key do React em `OrderReview` (`key={...}`) para evitar warning de keys duplicadas.

### Arquivos afetados
- `src/components/palm/OrderReview.tsx` — padding da lista + key normalizada
- `src/components/palm/CartItemRow.tsx` — padding interno do card
- `src/hooks/use-palm-cart.ts` — normalização da chave de dedupe no `loadOrder`

Sem mudança de banco. Preserva tag "POR X" quando há garçons diferentes.

