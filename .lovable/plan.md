

## Mostrar garçom em todos os lugares + agrupar itens repetidos

Dois problemas:

**A. Tag "por garçom" só aparece em alguns lugares.** Hoje aparece no Palm (OrderReview) e PDV (admin), mas não em: cozinha (KanbanCard) nem fechamento de conta (CloseOrder).

**B. Mesmo item anotado por garçons diferentes vira linhas separadas + risco de "X2" duplicado.** Quando 2 garçons anotam "Coca 350ml" na mesma mesa, salvamos 2 linhas em `order_items` com `waiter_name` diferente. Hoje a UI lista tudo cru — então aparece "1x Coca" "1x Coca" em vez de "2x Coca (João + Maria)" e, pior, se o mesmo garçom adicionar Coca em momentos diferentes (depois de fechar/reabrir a mesa), vira "1x Coca por João" + "1x Coca por João" duplicado.

### Solução

**1. Helper único `groupItemsByProductAndWaiter` em `src/lib/order-items-group.ts` (novo)**
- Recebe `OrderItem[]` (ou `CartItem[]`) + fallback waiter.
- Agrupa por chave `product_id|product_name|note|waiter` somando `quantity` e `subtotal`.
- Retorna lista enxuta sem duplicatas. Uma única fonte de verdade.

**2. Helper auxiliar `summarizeItemWaiters`**
- Agrupa só por produto+nota (ignorando garçom) e devolve `{ name, quantity, subtotal, note, waiters: string[] }`.
- Usado quando queremos UMA linha por produto mostrando "por João, Maria" no canto, em vez de duas linhas.

**3. Aplicar nos componentes**

| Local | Mudança |
|---|---|
| `CartItemRow` (Palm) | Manter como está (já agrupa por garçom no `addToCart`); apenas garantir que a tag não duplique caso `item.waiter_name === fallbackWaiter`. |
| `KanbanCard` (cozinha) | Usar `summarizeItemWaiters`. Cada linha vira `• 2x Coca 350ml — João, Maria` (lista de garçons em cinza, fonte menor, só se >1 garçom OU se diferente do `order.waiter_name`). |
| `CloseOrder` (cashier do garçom) | Mesmo: `summarizeItemWaiters` → uma linha por produto, lista de garçons como tag pequena ao lado. |
| `Pdv.tsx` (admin) | Trocar o `selectedItems.map` cru por `summarizeItemWaiters`. Mantém `showWaiterTag` (só mostra quando há >1 garçom único). Resolve o bug de "por João" repetir. |
| `OrderReview` (Palm, edição de mesa existente) | Hoje carrega itens do banco para `cart` no `loadOrder`. Adicionar **deduplicação no `loadOrder`** do `use-palm-cart`: se vier do banco 2 linhas com mesmo `product_id + note + waiter`, mergear somando quantidade. |

**4. Lógica da tag "por X" (regra única)**
```
mostrar tag se: waiters.length > 1  ||  (waiters.length === 1 && waiters[0] !== orderMainWaiter)
formato: "por João" (1)  |  "por João, Maria" (vários)
```
Nunca exibir o nome do mesmo garçom duas vezes na mesma linha — `Set` na lista.

### Arquivos afetados
- `src/lib/order-items-group.ts` — **novo**, helpers `groupItemsByProductAndWaiter` + `summarizeItemWaiters`
- `src/lib/__tests__/order-items-group.test.ts` — **novo**, casos: 2 garçons mesmo produto, mesmo garçom 2 linhas (dedupe), nota diferente não agrupa
- `src/hooks/use-palm-cart.ts` — dedupe no `loadOrder`
- `src/components/kitchen/KanbanCard.tsx` — usar summarize + tag de garçons
- `src/components/cashier/CloseOrder.tsx` — usar summarize + tag de garçons
- `src/pages/Pdv.tsx` — trocar map cru por summarize
- `src/components/palm/CartItemRow.tsx` — guard contra tag redundante

### Notas
- Sem mudança de banco. As linhas continuam separadas em `order_items` (preserva comissão/estatísticas por garçom). A unificação é só visual.
- A tela do **Kanban da cozinha** mostrar quem anotou ajuda na hora de preparar (cozinheiro sabe a quem perguntar dúvida do pedido).

