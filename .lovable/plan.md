

# Plano: Botão "Resetar Dia de Testes" no Admin

## Objetivo

Adicionar um botão no Admin → System que apaga **todos os dados operacionais do dia** (pedidos, itens, caixa, movimentos de estoque, estado do Telegram), deixando só o cadastro (produtos, inventário, settings, recipes, bindings) intacto. Para usar quando o dia foi só testes.

## Onde fica

Aba **Sistema** (`SystemTab.tsx`), em um card novo no topo, em vermelho, separado dos outros (arquivar / forçar update). Título: **"Limpar dados de teste"**.

Comportamento do botão:
1. Confirmação dupla (digitar `APAGAR` no prompt).
2. Mostra preview do que vai ser apagado (contagem por tabela).
3. Após confirmar, chama uma RPC `reset_operational_data()` e mostra resumo.

## O que será apagado

| Tabela | Ação |
|---|---|
| `order_items` | DELETE all |
| `orders` | DELETE all |
| `cash_movements` | DELETE all |
| `cash_register` | DELETE all (fecha tudo, abertos e fechados) |
| `inventory_movements` | DELETE all |
| `stock_movements` | DELETE all |
| `notification_queue` | DELETE all |
| `notification_log` | DELETE all |
| `telegram_chat_state` | DELETE all |
| `telegram_undo_stack` | DELETE all |
| `data_retention_log` | DELETE all |
| `pin_attempt_log` | DELETE all |
| `inventory_items.current_stock` | RESET para 0 |

## O que NÃO será apagado

- `products` (cardápio)
- `inventory_items` (só zera o estoque, mantém o cadastro)
- `product_recipes`
- `settings`
- `profiles`
- `telegram_user_bindings` (vínculos garçom↔Telegram)

## Implementação técnica

### 1. Migration: nova função RPC

```sql
CREATE OR REPLACE FUNCTION public.reset_operational_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_count int;
BEGIN
  DELETE FROM order_items; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_items', v_count);

  DELETE FROM orders; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders', v_count);

  DELETE FROM cash_movements; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cash_movements', v_count);

  DELETE FROM cash_register; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cash_register', v_count);

  DELETE FROM inventory_movements; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('inventory_movements', v_count);

  DELETE FROM stock_movements; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('stock_movements', v_count);

  DELETE FROM notification_queue;
  DELETE FROM notification_log;
  DELETE FROM telegram_chat_state;
  DELETE FROM telegram_undo_stack;
  DELETE FROM data_retention_log;
  DELETE FROM pin_attempt_log;

  UPDATE inventory_items SET current_stock = 0, updated_at = now();

  RETURN v_result || jsonb_build_object('reset_at', now());
END;
$$;
```

E uma função auxiliar `preview_operational_data()` que só faz `SELECT count(*)` de cada tabela (sem apagar) para alimentar o preview.

### 2. UI: novo card em `SystemTab.tsx`

- Card vermelho (`border-destructive`), ícone `Trash2`.
- Botão chama `preview_operational_data()` → mostra modal com contagens.
- Modal pede para digitar `APAGAR`.
- Ao confirmar, chama `reset_operational_data()` → toast com resumo.
- Invalida caches do React Query (`orders`, `cash_register`, `inventory`).

### 3. Arquivos tocados

- `supabase/migrations/<timestamp>_reset_operational_data.sql` (novo)
- `src/components/admin/SystemTab.tsx` (adiciona card)

## O que NÃO vou mexer

- Telegram webhook
- Frontend Palm/Kitchen/PDV/Cashier
- Cardápio, recipes, settings
- Bridge de impressão

## Resultado esperado

Um botão único no Admin que devolve o sistema ao estado "zero operacional" em <2s, mantendo todo o cadastro. Seguro contra clique acidental (confirmação dupla + texto "APAGAR").

