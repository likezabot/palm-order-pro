

## Diagnóstico

**Bug relatado:** Garçom Wilson abriu mesa, renomeou para "Felipe". Ao voltar na mesma mesa, o nome "Felipe" não apareceu — apareceu o nome original. Ele fez novo pedido e ficou com **duas mesas duplicadas** no grid (uma com nome original, outra com "Felipe").

**Causa raiz provável** (lendo `Palm.tsx` + `rename_order_table`):

1. `rename_order_table` atualiza `orders.table_name` mas **não toca em `original_table_name`**.
2. No `TableGrid` (preciso confirmar), as mesas em uso provavelmente são listadas a partir de `orders` ativos agrupados por `table_name` (o nome atual). Mas as mesas "vazias" do grid usam o nome físico fixo ("Mesa 5", "Mesa 6"...).
3. **Quando Wilson renomeia "Mesa 5" → "Felipe":** o pedido fica com `table_name="Felipe"` e `original_table_name="Mesa 5"`. No grid, aparece um card "Felipe" (pedido ativo) **e** o card fixo "Mesa 5" continua aparecendo como vazia (porque o grid renderiza as mesas físicas independentemente).
4. Wilson clica em "Mesa 5" achando que é a do Felipe → cai no fluxo de **mesa nova** (sem `orderId`), cria um **segundo pedido** com `table_name="Mesa 5"`. Resultado: duas mesas no grid, ambas com itens, sem ligação entre si.

**Por que é intermitente:** só acontece quando o garçom renomeia a mesa E depois clica no card físico antigo em vez do card renomeado. Se ele clicar no card "Felipe" funciona normal.

## Plano

### Passo 1 — Investigar `TableGrid.tsx` para confirmar a hipótese
Ler `src/components/palm/TableGrid.tsx` para ver exatamente como os cards são montados (mesas físicas fixas vs pedidos ativos) e confirmar que mesas renomeadas geram cards duplicados.

### Passo 2 — Fix no grid: ocultar mesa física que tem pedido ativo renomeado
Quando uma mesa física (ex: "Mesa 5") tem um pedido ativo cujo `original_table_name` é "Mesa 5" mas `table_name` é diferente ("Felipe"), o card físico **não deve aparecer como vazio** — ele já está em uso, só renomeado. O card renomeado ("Felipe") substitui visualmente o card físico, com badge "(Mesa 5)" pequeno embaixo para manter a referência.

### Passo 3 — Fix de proteção no servidor: bloquear criação de pedido em mesa já ocupada por renomeação
No `create_order` (RPC), adicionar verificação: se já existe um pedido ativo (`status IN ('new','preparing','done')`) cujo `original_table_name = p_table_name`, **rejeitar** com erro `table_already_in_use_renamed` e devolver o nome atual + orderId, para o frontend redirecionar o garçom ao pedido existente em vez de criar duplicata.

### Passo 4 — Tratamento no frontend
Em `OrderReview` (onde o pedido é criado), capturar esse erro específico e mostrar diálogo: "Esta mesa já está em uso como '{nome_atual}'. Deseja abrir esse pedido?" → ao confirmar, navega para o pedido existente.

### Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/components/palm/TableGrid.tsx` | Mesclar mesa física + pedido renomeado num único card |
| `supabase/migrations/...` (novo) | `create_order` valida `original_table_name` duplicado |
| `src/components/palm/OrderReview.tsx` | Tratar novo erro e redirecionar |

### Validação
1. Abrir Palm, escolher "Mesa 5", renomear para "Felipe", adicionar item, enviar.
2. Voltar ao grid: deve aparecer **apenas um card** "Felipe" (com "Mesa 5" pequeno embaixo) — não dois.
3. Tentar clicar em outra rota que tente criar pedido em "Mesa 5" → deve receber alerta e ser redirecionado ao pedido do Felipe.
4. Pedidos antigos que já estão duplicados continuam visíveis (não quebra dados existentes).

