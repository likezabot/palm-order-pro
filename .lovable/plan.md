

## Liberar mesa instantaneamente ao fechar conta

### Problema
Ao tocar "Fechar mesa", o app chama `pay_order` e volta pra grade, mas **a mesa continua vermelha** por 1–3s até o Realtime entregar o UPDATE de `status='paid'`. Em fluxo intenso, isso atrasa pegar o próximo pedido na mesma mesa.

Causa: `CloseOrder` não toca no cache `["active-orders"]` — depende 100% do Realtime. Como agora temos cache persistente + `placeholderData` + `staleTime: 60s`, a UI exibe o estado antigo até o canal entregar o evento.

### Solução: remoção otimista do pedido do cache

**`src/components/cashier/CloseOrder.tsx`**
1. Importar `useQueryClient`.
2. Em `handleConfirm`, **antes** de chamar o RPC:
   - Snapshot do cache atual: `queryClient.getQueryData(["active-orders"])`.
   - Remover o pedido fechado: `setQueryData(["active-orders"], prev => prev.filter(o => o.id !== order.id))`.
   - Cancelar queries em voo: `queryClient.cancelQueries({ queryKey: ["active-orders"] })`.
3. Chamar `pay_order`.
4. Em **sucesso**: invalidar `["active-orders"]` (refetch silencioso confirma o estado) e chamar `onClosed()`.
5. Em **erro**: restaurar snapshot (`setQueryData` com valor original) + toast de erro.

**Resultado**
- Toque em "Fechar e imprimir" / "Fechar sem imprimir" → mesa some da grade **no mesmo frame** que o usuário volta pra TableGrid.
- Se o RPC falhar (raro), a mesa volta a aparecer e mostra o erro.
- Realtime continua como rede de segurança para sincronizar outros dispositivos.

### Bônus de robustez
Aplicar o mesmo padrão otimista em **Cashier** (`src/pages/Cashier.tsx`) onde o pagamento via PDV também usa `pay_order` — assim a mesa some instantâneo da grade do Palm em outros tablets via Realtime, e do próprio Cashier sem esperar o roundtrip.

### Arquivos
- **Editado** `src/components/cashier/CloseOrder.tsx` — atualização otimista + rollback em erro.
- **Editado** `src/pages/Cashier.tsx` — mesmo padrão otimista no fluxo de pagamento (verificar handler do `pay_order`).

### Detalhes técnicos
- Usar `queryClient.cancelQueries` antes do `setQueryData` para evitar que um refetch em voo sobrescreva o cache otimista.
- O `["order-items", order.id]` pode ser deixado intacto — não afeta a grade.
- Não mexemos no RPC nem em RLS — só em cache do cliente.

