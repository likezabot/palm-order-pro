
## Objetivo
Rastrear vendas por garçom **no nível do item** (não mais só no pedido), permitindo saber quanto cada garçom vendeu mesmo quando vários atendem a mesma mesa.

## Problema atual
- `orders.waiter_name` guarda apenas o garçom que **abriu** a mesa.
- Se outro garçom adiciona itens depois, a venda inteira fica creditada ao primeiro.
- A aba de Estatísticas (StatsPanel) provavelmente agrega por `orders.waiter_name`, distorcendo o ranking.

## Solução
Adicionar `waiter_name` em cada `order_items`, capturado no momento em que o item é inserido/editado.

### Mudanças

**1. Banco (migration)**
- Adicionar coluna `waiter_name text` em `order_items` (nullable, para itens antigos).
- Atualizar funções RPC para receber e gravar o garçom por item:
  - `create_order(...)` — ler `item->>'waiter_name'` ao inserir.
  - `update_order_items(...)` — idem (cada item carrega seu próprio garçom).
- Backfill: itens existentes sem `waiter_name` herdam de `orders.waiter_name`.

**2. Frontend — captura por item**
- `src/lib/types.ts`: adicionar `waiter_name?: string` em `CartItem` e `OrderItem`.
- `src/hooks/use-palm-cart.ts`: 
  - `addToCart` passa a receber/anexar o `waiterName` atual ao item.
  - `loadOrder` preserva o `waiter_name` original de cada item carregado (não sobrescreve).
- `src/pages/Palm.tsx`: passar `waiterName` para `addToCart`.
- `src/components/palm/OrderReview.tsx`: ao chamar `create_order`/`update_order_items`, incluir `waiter_name` em cada item do payload JSON.

**3. UI — visibilidade**
- `OrderReview` e `OrderRow` (PDV): mostrar tag pequena com o nome do garçom ao lado de cada item (cinza, opcional, só quando há mais de um garçom no pedido).
- Header da mesa no Palm/PDV: deixar de mostrar "Garçom: Fulano" como dono fixo — mostrar "Aberta por: Fulano" para deixar claro que é só quem iniciou.

**4. Estatísticas (StatsPanel)**
- Trocar a agregação: somar `order_items.subtotal` agrupado por `order_items.waiter_name` (com fallback para `orders.waiter_name` quando nulo, cobrindo histórico).
- Período: manter os filtros existentes (hoje, semana, mês).
- Mostrar: ranking com nome, qtd de itens vendidos, total em R$, ticket médio por item.

## Arquivos afetados
- migration nova (coluna + atualização das 2 funções RPC + backfill)
- `src/lib/types.ts`
- `src/hooks/use-palm-cart.ts`
- `src/pages/Palm.tsx`
- `src/components/palm/OrderReview.tsx`
- `src/components/admin/StatsPanel.tsx`
- `src/components/pdv/OrderRow.tsx` (badge do garçom por item)

## Notas
- Itens antigos continuam funcionando (fallback para `orders.waiter_name`).
- Sem breaking changes na API: `waiter_name` é opcional no payload.
- Testes: adicionar 2 testes — agregação por garçom com fallback, e merge de itens preservando o garçom original.
