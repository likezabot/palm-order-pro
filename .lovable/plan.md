

# Plano: tempo real de verdade em Home, Cozinha e PDV

## Problema atual

O sistema **já tem Realtime do Supabase**, mas a experiência percebida ainda parece "lenta" em três pontos:

1. **Home (TableGrid)**: usa `useQuery` com `refetchInterval` de polling. Mudanças em pedidos chegam só quando o intervalo dispara, não imediatamente.
2. **Cozinha (Kanban)**: tem realtime, mas cada UPDATE invalida a query inteira → refetch completo da lista → re-render de todos os cards (visualmente trava por uma fração de segundo em listas grandes).
3. **PDV**: o `usePdvRealtime` invalida queries a cada evento, mas o React Query refaz a busca no servidor antes de atualizar a UI — atraso visível de 200-500ms entre o evento chegar e a tela mexer.

Resumindo: o realtime funciona, mas o padrão "evento → invalida → refetch" sempre paga uma ida de rede extra. Para parecer **instantâneo**, precisamos atualizar o cache local **diretamente com o payload** e usar o refetch só como reconciliação de fundo.

## Estratégia: mutação otimista do cache + reconciliação

Em vez de `invalidateQueries`, usar `queryClient.setQueryData` para **mesclar o payload do realtime direto no cache**. A UI atualiza no mesmo frame em que o evento chega. O refetch ainda acontece em background como rede de segurança (debounced).

## Mudanças por tela

### 1. Home — `src/pages/Index.tsx` + `src/components/palm/TableGrid.tsx`

- Adicionar hook `useHomeRealtime` que escuta `orders` (INSERT/UPDATE/DELETE) e `order_items` (`*`).
- Em INSERT de `orders`: faz `setQueryData(['home-orders'], old => [...old, newOrder])`.
- Em UPDATE: substitui a linha pelo `payload.new` (merge por id).
- Em DELETE: remove do array.
- Em `order_items` `*`: como o badge de quantidade vem dos itens, dispara um `invalidateQueries(['home-items'])` debounced em 300ms (não precisa ser instantâneo por item).
- Remover/aumentar o `refetchInterval` atual para 60s (passa a ser só reconciliação).
- **Animação visual**: quando uma mesa muda de estado (livre → ocupada, mudou total), aplicar uma classe `animate-pulse-once` por 600ms para o operador perceber a atualização.

### 2. Cozinha — `src/pages/Kitchen.tsx` (já tem realtime, otimizar)

- Trocar `invalidateQueries` por `setQueryData` no handler do canal:
  - INSERT `orders` com status `new` → adiciona no topo da coluna "Novos".
  - UPDATE `orders` com mudança de `status` → move o card entre colunas (`new` → `preparing` → `done`) com `setQueryData`.
  - UPDATE `orders` com mudança de `served_at` → remove da coluna "Pronto" (já entregue).
- Adicionar **animação de transição** no `KanbanCard` quando ele muda de coluna: framer-motion `layout` prop ou CSS `transition: transform`.
- **Som de notificação** já existe no PDV — replicar para Cozinha: `playFeedback("notification")` quando entra novo pedido.
- Quando cozinha clica em "Avançar", já chamamos `update_order_status` (RPC) — adicionar **optimistic update** no `useMutation`: muda a coluna no cache antes da resposta do servidor chegar, para o card "voar" instantaneamente.

### 3. PDV — `src/hooks/use-pdv-realtime.ts` (refatorar)

- Substituir `invalidateQueries(['pdv-orders'])` por `setQueryData(['pdv-orders'], merge)` direto do payload.
- Para `order_items` (UPDATE/INSERT/DELETE), o payload do Supabase Realtime traz a linha completa — atualizar o cache de `pdv-items` por `order_id`:
  ```ts
  setQueryData(['pdv-items', orderId], (old) => mergeItem(old, payload.new))
  ```
- Manter o `playFeedback("notification")` + toast atual.
- O fallback de polling de 10s quando realtime cai continua igual (já está bom).

### 4. Indicador visual global

- No `ConnectivityBanner`, quando realtime está `online`, mostrar um pequeno **dot verde piscando** ("ao vivo") em vez de só esconder o banner. Dá feedback de que o sistema está vivo.

## Arquivos afetados

- `src/hooks/use-pdv-realtime.ts` — trocar invalidate por setQueryData.
- `src/pages/Kitchen.tsx` — mesmo tratamento + optimistic update na mutação.
- `src/pages/Index.tsx` — adicionar realtime hook próprio.
- `src/hooks/use-home-realtime.ts` — **novo arquivo** para a Home.
- `src/components/palm/TableGrid.tsx` — animação `animate-pulse-once` em transições.
- `src/components/kitchen/KanbanCard.tsx` — animação de layout.
- `src/components/ConnectivityBanner.tsx` — dot "ao vivo" verde quando online.
- `src/index.css` — keyframes da animação `pulse-once`.

## Resultado esperado

- Mesa muda de cor no instante em que o garçom finaliza o pedido em outro dispositivo (sem esperar refetch).
- Card da cozinha "voa" entre colunas no clique, sem travada visual.
- PDV vê o item novo aparecer no mesmo frame em que o pedido é atualizado.
- Som + animação dão feedback claro de que algo mudou.
- Carga no servidor **diminui** (menos refetches).

## Risco e mitigação

- **Cache fora de sincronia** se o payload chegar fora de ordem: o `version` da `orders` permite descartar updates antigos. Adicionar guarda `if (payload.new.version < cached.version) return;`.
- **Reconciliação periódica**: manter um `refetchOnWindowFocus: true` e um refetch de 60s como rede de segurança.

