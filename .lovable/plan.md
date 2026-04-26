## Objetivo

Apagar 100% do módulo de estoque (inventory) — incluindo a parte que ainda aparece no Telegram (mensagem "📦 Movimentação de estoque hoje" e comandos `entrada/saida/estoque/lista estoque`), sem afetar pedidos, impressão (`print_jobs`/bridge/Electron), cardápio público, PALM, Kitchen, Cashier ou autocorreções.

## O que está envolvido hoje

**Banco (a remover):**
- Tabelas: `inventory_items`, `inventory_movements`, `product_recipes`, `stock_movements`
- Funções RPC: `apply_inventory_movement`, `find_inventory_item_by_text`, `auto_inventory_from_order_items`, `queue_stock_alert`, `queue_stock_in`, `sync_inventory_category_from_product`, `admin_upsert_inventory_item`, `admin_bulk_import_inventory`, `admin_set_recipe`, `admin_delete_recipe`
- Triggers: `trg_order_items_auto_inventory_ins/del/upd` (em `order_items`), `trg_queue_stock_alert`, `trg_queue_stock_in`, `trg_sync_inventory_category`, `inventory_items_updated_at`

**Edge Functions (a editar):**
- `supabase/functions/telegram-webhook/index.ts` — remover todos os comandos `STOCK_*`, regex de entrada/saída/ajuste/estoque/lista, blocos de help e preview, resolução `find_inventory_item_by_text`, undo de estoque
- `supabase/functions/notify-telegram/index.ts` — remover handlers `stock_critical` e `stock_in`
- `supabase/functions/daily-waiter-report/index.ts` — remover seção "📦 Movimentação de estoque hoje" (linhas ~117–161)

**Frontend Admin (a editar):**
- `src/components/admin/SystemTab.tsx` — remover toggle "Zerar estoque", linhas de preview (`inventory_movements`, `inventory_items_with_stock`), parâmetro `p_reset_stock`, contadores no relatório

**Funções de manutenção a ajustar:**
- A função de "reset_app" / retenção que recebe `p_reset_stock` e conta `inventory_movements` precisa ser recriada sem essas colunas
- Função de purge antiga (`20260422211818`) que faz `DELETE FROM inventory_movements/stock_movements` — substituir por versão sem essas linhas

## Plano de execução (na ordem)

### 1. Migration de remoção do banco
- `DROP TRIGGER` dos 7 triggers listados
- `DROP FUNCTION` das 10 funções de estoque (com `CASCADE` apenas onde necessário)
- `DROP TABLE public.inventory_movements, public.inventory_items, public.product_recipes, public.stock_movements CASCADE`
- Recriar `cleanup_old_data` / função de retenção sem referências a estoque
- Recriar a RPC de reset usada por SystemTab sem `p_reset_stock` e sem contadores de estoque (mantendo assinatura compatível ou ajustando o frontend junto)
- Registrar no `error_log` com `source='migration'`, `severity='info'`, `code='inventory_module_removed'` para auditoria

### 2. Telegram webhook (`telegram-webhook/index.ts`)
- Remover do parser: `STOCK_MOVEMENT`, `STOCK_CRITICAL`, `STOCK_LIST`, `STOCK_QUERY`, `STOCK_OUT_NOW`, `STOCK_MENU` e suas regex (`entrada`, `saida`, `estoque`, `lista estoque`, `inventario`, `quanto tem`, etc.)
- Remover handlers correspondentes (~linhas 2255–2530)
- Remover do help (`📦 *ESTOQUE*` block ~linha 2255)
- Remover undo de movimentos de estoque
- Remover toda chamada a `find_inventory_item_by_text` / `apply_inventory_movement` / leitura de `inventory_items`
- Manter intactos: pedidos, mesas, fechamento, ranking de garçons

### 3. Notify-telegram (`notify-telegram/index.ts`)
- Remover branches `stock_critical` (linha ~251) e `stock_in` (~256). Se chegar evento desses tipos no `notification_queue`, ignorar silenciosamente

### 4. Relatório diário (`daily-waiter-report/index.ts`)
- Apagar bloco "movimentação de estoque do dia + críticos" (linhas ~117–161). Relatório passa a ter só ranking de garçons + total da casa (que é o que você quer)

### 5. Admin SystemTab (`SystemTab.tsx`)
- Remover state `resetStock`, checkbox "Zerar estoque atual", textos "Mov. estoque", "estoques zerados", "movimentos de estoque" e o parâmetro `p_reset_stock` da chamada RPC
- Atualizar texto descritivo para não mencionar estoque

### 6. Limpeza menor
- Remover menção a estoque em `OnlineMenuTab.tsx` (linha 222 — só texto)
- Atualizar memórias `.lovable/memory/features/telegram-bot.md` e `telegram-notifications.md` removendo seções de estoque

### 7. Deploy + verificação
- Deploy automático das 3 edge functions
- Rodar `db-consistency-check` para garantir que nada quebrou
- Logar em `error_log` o sucesso da remoção

## Garantias de segurança

- ✅ **NÃO toca em**: `print_jobs`, `orders`, `order_items` (só remove triggers de estoque, não a tabela), bridge, Electron, EXE, RLS de tabelas mantidas, fluxo de impressão
- ✅ **NÃO toca em**: autocorreções do `health-check`, `error_log`, cron jobs (exceto se algum referenciar estoque — verificar)
- ✅ Triggers em `order_items` (`trg_order_items_auto_inventory_*`) são removidos mas `order_items` em si fica intacta — pedidos continuam funcionando normalmente
- ✅ `CASCADE` só nos `DROP TABLE` para limpar FKs internas do módulo de estoque
- ✅ Auditoria: tudo registrado em `error_log` com `source='migration'`

## Como testar depois

1. **Telegram**: enviar `estoque coca` → bot deve responder "comando não reconhecido" (ou cair no help sem seção de estoque). Enviar `mesa 5 1 coca` → pedido normal deve funcionar
2. **Relatório diário**: aguardar cron ou disparar manual → mensagem do Telegram não pode ter mais "📦 Movimentação de estoque hoje"
3. **Admin → Sistema**: a aba não pode mais mostrar checkbox de zerar estoque nem contadores
4. **PALM**: criar pedido, fechar, imprimir → tudo funciona igual
5. **Cardápio público**: navegar e pedir → funciona igual
6. **Console do banco**: `\dt public.inventory_*` não retorna nada
7. **`error_log`**: verificar entrada `inventory_module_removed` e ausência de novos erros

## Arquivos que serão alterados

- `supabase/migrations/<nova>.sql` (criar)
- `supabase/functions/telegram-webhook/index.ts`
- `supabase/functions/notify-telegram/index.ts`
- `supabase/functions/daily-waiter-report/index.ts`
- `src/components/admin/SystemTab.tsx`
- `src/components/admin/OnlineMenuTab.tsx` (texto)
- `.lovable/memory/features/telegram-bot.md`
- `.lovable/memory/features/telegram-notifications.md`