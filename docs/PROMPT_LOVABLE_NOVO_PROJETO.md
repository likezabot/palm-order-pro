# Plano B Espetaria — Sistema PDV completo (clone funcional)

Construa um sistema PDV (ponto de venda) completo para uma espetaria, em React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Lovable Cloud (Supabase). Idioma: pt-BR. Tema dark (#0D0D0D fundo, #E25822 laranja brasa primário). Fonte Inter, mínimo 14px, botões mínimo 56px, border-radius 12px. PWA instalável. Sem autenticação (RLS aberto, sistema de balcão).

## Módulos (5 rotas principais)

1. **/** — Home: grid 2x3 com cards grandes para Palm, Cozinha, Caixa, Admin, Estação de Impressão.
2. **/palm** — Garçom: grade de mesas → cardápio em abas (Refeições, Espetos, Bebidas, Cervejas) → carrinho → confirmação. Suporta variantes (ex: "Picanha + Frango"), notas por item, mover mesa, renomear mesa.
3. **/kitchen** — Cozinha: kanban com 3 colunas (Novos, Preparando, Prontos). Cards com timer de tempo decorrido. Toque alterna status.
4. **/cashier** — Caixa: lista pedidos prontos/preparando agrupados por mesa, fechamento com método de pagamento (dinheiro/pix/débito/crédito), troco, abertura/fechamento de caixa, sangria/suprimento.
5. **/admin** — Admin: produtos (CRUD com drag-and-drop), grupos/variantes, estoque, estatísticas, configuração de impressão, diagnóstico, exportar dados.

## Banco de dados (Lovable Cloud)

Crie estas tabelas com RLS aberto (`USING true` em SELECT, todas mutações via RPC SECURITY DEFINER):

- **products** (id, name, price, category, active, aliases[], unit, stock_quantity, created_at)
- **orders** (id, table_name, original_table_name, waiter_name, total, status[new|preparing|done|paid|cancelled], amount_paid, payment_method, version, print_status[pending|printing|printed|queued], print_type[full|delta], print_claimed_at, print_last_error, printed_at, delta_items jsonb, served_at, created_at, updated_at)
- **order_items** (id, order_id, product_id, product_name, product_price, quantity, note, subtotal, waiter_name)
- **cash_register** (id, opened_at, closed_at, status[open|closed], initial_amount, final_amount, total_sales)
- **cash_movements** (id, cash_register_id, type[sangria|suprimento|in|out], amount, reason, created_at)
- **inventory_items** (id, name, slug, category, unit, aliases[], current_stock, min_stock, is_active, product_id, created_at, updated_at)
- **inventory_movements** (id, item_id, movement_type[in|out|adjustment], quantity, note, source, created_at)
- **settings** (key PK, value text)  ← guarda layout do cupom, telegram config, etc
- **daily_sales_summary**, **daily_waiter_stats**, **daily_product_stats** (agregados pré-calculados)
- **notification_queue**, **notification_log** (Telegram, opcional)
- **data_retention_log**

## RPCs obrigatórias (SECURITY DEFINER)

- `create_order(p_table_name, p_waiter_name, p_total, p_items jsonb, p_should_print bool, p_original_table_name)` — bloqueia mesa duplicada (exceto BALCÃO), recalcula total a partir de products.price (preço autoritativo), insere itens, retorna `{id, created_at, total}`. Limite 200 itens.
- `update_order_items(p_order_id, p_total, p_items, p_delta_items, p_print_type, p_expected_version, p_should_print)` — versionamento otimista, `delta_items` para imprimir só novos itens.
- `update_order_status(p_order_id, p_status)` — valida transições, bloqueia mexer em paid/cancelled.
- `rename_order_table(p_order_id, p_new_name)` — bloqueia se paid.
- `merge_table_duplicates(p_table_name)` — consolida pedidos abertos da mesma mesa.
- `claim_order_print(p_order_id)` → bool — atomicamente move pending→printing.
- `complete_order_print(p_order_id)` — printing→printed.
- `defer_order_print(p_order_id)` — pending/printing→queued (bridge offline).
- `recover_stuck_prints()` — watchdog: reverte printing>2min, auto-cancela pending paid>2h.
- `force_clear_orphan_prints()` — limpa pendings de pedidos paid.
- `cash_open(p_pin, p_initial)`, `cash_close(p_pin, p_register_id, p_final)`, `cash_movement_add(...)`.
- `verify_manager_pin(p_pin, p_fingerprint)` — sempre true (PIN desabilitado por escolha do operador, mantido para compat).

## Triggers

- `auto_inventory_from_order_items` em order_items (INSERT/UPDATE/DELETE): debita/credita estoque automaticamente, exceto categoria `refeicoes`.
- `reset_served_at_on_new_items`: zera served_at quando novos itens entram.
- `update_updated_at_column` em orders.

## Cardápio inicial (seed)

- **Refeições**: Picanha (45), Picanha + Frango (45), Frango (40), Filé (45), Maminha (40)
- **Espetos**: Picanha (12), Coração (10), Frango c/ Bacon (10), Linguiça (8), Carne (8)
- **Bebidas**: Coca lata (6), Guaraná lata (6), Água (4), Suco (8)
- **Cervejas**: Heineken long (12), Original long (10), Brahma 600ml (15), Skol lata (6)

## Camada de impressão (CRÍTICO — não repetir os erros anteriores)

Crie `src/lib/print-config.ts` com:
- `LOCAL_ONLY_KEYS = ['bridgeUrl', 'printMode']` — NUNCA sincronizam via Supabase.
- Outros campos (layout, header, footer, papelMm) sincronizam via tabela `settings`.
- `syncPrintConfigFromDb()` lê DB mas preserva os locais.

Crie `src/lib/thermal-printer.ts` com `checkBridgeStatus(url)` que:
- Faz GET com timeout 1500ms.
- Aceita BOTH formatos: `{printer_connected}` (legado) E `{printer_ok, printer_ready, printer_name, bridge_version}` (v2.2).
- Retorna `{online, printerReady, printerName, version, error}`.

Crie `src/lib/print-queue.ts` (IndexedDB) — fila local de retry.

Crie `src/lib/print-queue-worker.ts` — singleton, tick 15s, processa fila quando `status.online=true` (não exige printerReady, porque PowerShell spooler retorna UNKNOWN mas funciona).

Crie `src/lib/global-order-runtime.ts` — escuta realtime de orders, dispara impressão automática para qualquer pedido novo via Palm/Telegram, watchdog de stuck.

Em `Pdv.tsx` e `Cashier.tsx`, `manualPrintOrder()` retorna `{ok, bridgeOk, queued, error}`. Sempre cheque `result.ok` para sucesso, `result.queued` para "enfileirado offline", senão erro.

## Configuração padrão

A bridge será um app Electron rodando em `http://localhost:3001/print` (ver Prompt 2 do Codex). O frontend só conhece esse contrato HTTP — qualquer bridge que respeite o contrato `/health`, `/printers`, `/print` funciona.

## PWA

- `public/manifest.json` (modo standalone, ícone laranja brasa).
- `public/sw.js` network-first para navigation, cache-first para assets, NUNCA cacheia Supabase.
- `index.html` com tema dark anti-flash via localStorage `plano-b-theme-v2`.

## Não inclua

- Autenticação de usuário.
- Telegram bot (deixe a tabela `notification_queue` mas não implemente edge function ainda).
- Multi-tenant.
- Imagens de produto.

## Critério de aceite

- [ ] Garçom abre /palm, escolhe mesa, monta pedido, confirma.
- [ ] Pedido aparece em /kitchen instantaneamente (realtime).
- [ ] Cozinha move card → /cashier vê pronto.
- [ ] Caixa fecha mesa, escolhe pagamento, aparece em /admin > estatísticas.
- [ ] Admin altera preço sem PIN, mudança propaga para todos os dispositivos.
- [ ] Bridge URL é local por dispositivo (desktop usa localhost, celular usa IP).
- [ ] Quando bridge offline, pedido vai pra fila local e tenta de novo a cada 15s.
