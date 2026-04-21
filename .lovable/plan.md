

## Voltar à grade de mesas com pedido novo já visível, sem timeout

### Problema atual
1. Em `OrderSuccess`, mesmo para pedidos de mesa (sem senha/impressão local), há um **timeout fixo de 700ms** antes de chamar `onReset()` e voltar à `TableGrid`.
2. Quando a grade aparece, ela mostra o cache antigo até o realtime do Supabase invalidar a query `["active-orders"]` — o que adiciona mais alguns ms (e às vezes segundos em conexão ruim).
3. O resultado é uma sensação de atraso de 1-2s entre "envio do pedido" e "vejo a mesa vermelha".

### Solução

**1. Reset imediato para pedidos de mesa (`OrderSuccess.tsx`)**
- Quando `!shouldShowBadge` (mesa, sem badge de senha/impressão local), chamar `onReset()` **na hora** (delay = 0, via `requestAnimationFrame` para garantir que o React mostre o checkmark por 1 frame e depois transicione).
- Atualmente já está em 700ms — vamos zerar.
- **Alternativa considerada**: pular completamente a tela `OrderSuccess` para mesas. Decisão: manter a tela mas instantânea, porque dá o feedback visual de "pedido enviado" que o garçom espera. O fade-out fica natural pela própria transição da grade.

**2. Atualização otimista do cache da grade (`OrderReview.tsx`)**
- Após o RPC `create_order` / `update_order_items` retornar com sucesso, **antes** de chamar `onSuccess()`:
  - Usar `queryClient.setQueryData(["active-orders"], ...)` para **inserir/atualizar** o pedido recém-criado direto no cache.
  - Para criação: empurrar um objeto `{ id, table_name, original_table_name, status: "new", total, waiter_name, created_at, served_at: null, item_count: <soma cart> }` na lista.
  - Para edição: substituir o pedido existente com os novos totais e item_count atualizado.
- Assim, quando a `TableGrid` montar, o pedido **já está no cache** — a mesa aparece vermelha instantaneamente. O realtime do Supabase em seguida apenas confirma/refina os dados.

**3. Ajuste fino de transição**
- Manter `OrderSuccess` com animação rápida (~250ms) para o checkmark, mas **não bloqueante**: `onReset()` dispara imediatamente; a grade já renderiza por baixo.
- Para pedidos com badge (BALCÃO com impressão local), manter os tempos atuais (não mexer — usuário precisa ver senha).

### Arquivos
- **Editado**: `src/components/palm/OrderSuccess.tsx` — `delay = 0` quando `!shouldShowBadge`, usando `requestAnimationFrame` em vez de `setTimeout`.
- **Editado**: `src/components/palm/OrderReview.tsx` — após sucesso do RPC, fazer `queryClient.setQueryData(["active-orders"], ...)` para inserir/mesclar o pedido otimisticamente. Importar `useQueryClient`.
- **Sem mudanças**: realtime channel, banco, `TableGrid`.

### Detalhes técnicos
- O `setQueryData` precisa ser tolerante: se a query nunca foi montada (cache vazio), ignora silenciosamente — quando a grade montar e fizer o fetch inicial, vai pegar do banco.
- Para edição (`update_order_items`), o cache já tem o pedido — só atualizamos `total` e re-derivamos `item_count` somando `cart`.
- Para criação, o `create_order` retorna `{ id, created_at }` — já temos tudo para construir o objeto.
- Não mexemos em `print_status`/realtime: o canal continua chegando e refinando o estado real (caso outro garçom tenha mexido em paralelo).

### Resultado
- Garçom toca "Enviar pedido" → vê checkmark verde por ~1 frame → grade aparece **com a mesa já vermelha/com valor**.
- Sensação de instantâneo, sem depender de latência de rede do realtime.
- Realtime continua funcionando como rede de segurança / sincronia entre dispositivos.

