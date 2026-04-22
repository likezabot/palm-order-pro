

# Retenção de dados — apagar pedidos antigos mantendo histórico agregado

## Objetivo
Reduzir tamanho do banco apagando pedidos pagos antigos, **preservando**:
- Histórico por garçom (vendas, itens, mesas, ticket médio)
- Histórico por produto (quantidade vendida, receita)
- Totais diários (faturamento, formas de pagamento)

E **descartando**:
- Linhas individuais de `order_items` antigas
- Registros completos de `orders` antigos
- `inventory_movements` muito antigos
- `notification_log` e `notification_queue` processadas

## Estratégia

Antes de apagar, **agregar para tabelas de histórico** (snapshots diários). Depois disso o `StatsPanel` lê de `orders` (recente) + `daily_*` (histórico).

### 1. Novas tabelas de arquivo (migration)

**`daily_waiter_stats`** — uma linha por (dia, garçom)
```
date date, waiter_name text, orders_count int, items_count int,
revenue numeric, tables_count int, PRIMARY KEY (date, waiter_name)
```

**`daily_product_stats`** — uma linha por (dia, produto)
```
date date, product_id uuid null, product_name text,
quantity_sold numeric, revenue numeric,
PRIMARY KEY (date, product_name)
```

**`daily_sales_summary`** — uma linha por dia
```
date date PRIMARY KEY, orders_count int, total_revenue numeric,
payment_breakdown jsonb -- {dinheiro: 120, pix: 340, cartao: 220}
```

RLS: leitura pública (igual `orders`), escrita só via função `SECURITY DEFINER`.

### 2. Função `archive_and_purge_old_data(p_days_keep int default 60)`

Lógica em uma transação:
1. Para cada dia com pedidos `paid` **mais antigos que N dias** que ainda não estão em `daily_sales_summary`:
   - Agrega em `daily_waiter_stats`, `daily_product_stats`, `daily_sales_summary` (UPSERT idempotente).
2. `DELETE FROM order_items WHERE order_id IN (paid older than N days)`.
3. `DELETE FROM orders WHERE status='paid' AND created_at < now() - N days`.
4. `DELETE FROM inventory_movements WHERE created_at < now() - 90 days`.
5. `DELETE FROM notification_log WHERE sent_at < now() - 30 days`.
6. `DELETE FROM stock_movements WHERE created_at < now() - 90 days`.
7. `DELETE FROM cash_movements` órfãos de cash_register fechados há >90d.
8. Retorna jsonb com contagens.

### 3. Janela de retenção (defaults sugeridos)

| Dado | Mantém em `orders/order_items` | Mantém agregado | 
|---|---|---|
| Pedidos pagos | 60 dias | indefinido (daily_*) |
| Movimentos de estoque | 90 dias | — |
| notification_log | 30 dias | — |
| notification_queue processada | 7 dias (já existe no watchdog) | — |
| cash_movements de caixas fechados | 90 dias | — |

Valor configurável via parâmetro da função.

### 4. Agendamento (pg_cron)

Job diário às 04:00 (horário de baixo movimento):
```sql
cron.schedule('archive_and_purge_daily', '0 4 * * *',
  $$ SELECT public.archive_and_purge_old_data(60); $$);
```

### 5. Backfill inicial

Rodar a função uma vez manualmente após criar as tabelas. Como hoje só tem dados de 14/04 a 22/04 (8 dias) e o threshold é 60d, **nada será apagado agora** — só criamos a infra. Quando passar 60 dias dos primeiros pedidos, começa a economizar automaticamente.

### 6. Atualização do `StatsPanel.tsx`

Ler de duas fontes e mesclar:
- **Período recente** (≤60d): query atual em `orders` + `order_items`.
- **Período histórico** (>60d, ex: 30d/personalizado caindo na janela arquivada): query em `daily_waiter_stats` / `daily_product_stats` / `daily_sales_summary`.

Mesclagem feita no client (memos `byWaiter`, `byProduct`, `summary`). Para o agregado histórico não há `payment_method` por pedido individual — usamos `payment_breakdown` do `daily_sales_summary` (suficiente para gráfico de pagamentos).

### 7. Botão admin "Arquivar agora"

Em `SystemTab.tsx` adicionar botão "Arquivar e limpar pedidos antigos" que chama `archive_and_purge_old_data(60)` via RPC e mostra toast com o resumo retornado.

## Arquivos modificados

- **nova migration** `supabase/migrations/<ts>_data_retention.sql`
  - Cria `daily_waiter_stats`, `daily_product_stats`, `daily_sales_summary` + RLS.
  - Cria função `archive_and_purge_old_data(int)` `SECURITY DEFINER`.
  - Agenda `pg_cron` diário às 04:00.
  - Index em `orders(status, created_at)` para acelerar o purge.
- `src/components/admin/StatsPanel.tsx` — adicionar leitura das tabelas `daily_*` quando o período pedido ultrapassa a janela ao vivo; mesclar com dados de `orders`.
- `src/components/admin/SystemTab.tsx` — botão "Arquivar pedidos antigos agora".
- `src/integrations/supabase/types.ts` — auto-regenerado pela migration.

## Não alterado

- Bridge `.exe`, ESC/POS, contratos `/health`, `/print`.
- Estrutura de `orders` e `order_items` (apenas DELETEs antigos).
- Fluxos do PDV, Palm, Cashier, Kitchen, Telegram bot.
- Watchdog de impressão (continua independente).
- Estoque atual (`inventory_items.current_stock` permanece intacto).

## Resultado esperado

- A partir de 60 dias, pedidos pagos antigos somem de `orders` mas o `StatsPanel` continua mostrando totais diários, ranking de garçons e top produtos para qualquer período histórico.
- Banco cresce de forma controlada (~3 linhas/dia em `daily_*` vs centenas em `order_items`).
- Bridge e impressão **não são tocadas** — `.exe` continua funcionando idêntico.

