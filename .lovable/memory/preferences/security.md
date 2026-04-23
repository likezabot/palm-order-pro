---
name: security-hardening-cycle-2
description: Estado pós-Ciclo 2 da auditoria — RPCs validadas, RLS read-only para anon, PIN hash, regras para evitar regressão
type: constraint
---

# Modelo de segurança do POS (Plano B Espetaria)

POS de tenant único, sem login de usuário. Defesa em profundidade aplicada via:
1. **SELECT público** continua em todas as tabelas operacionais (POS precisa exibir).
2. **INSERT/UPDATE/DELETE diretos do client estão BLOQUEADOS** em: `orders`, `order_items`, `products`, `cash_register`, `cash_movements`, `inventory_items`, `inventory_movements`, `settings`, `profiles`, `stock_movements`, `product_recipes`. Apenas RPCs `SECURITY DEFINER` mutam esses dados.
3. **PIN de gerente** está em `profiles.pin_hash` (bcrypt, pgcrypto). Coluna `pin_hash` é REVOKE para anon/authenticated. Validação via `verify_manager_pin(pin, fingerprint)` com rate-limit (5 falhas / 15min por fingerprint).

## Regras invioláveis (não regredir)

**REGRA 1 — Toda RPC SECURITY DEFINER que mexe com dinheiro DEVE recalcular no servidor.**
Nunca confiar em `p_total`, `p_subtotal`, `p_amount_paid` vindos do client sem revalidar contra `products.price` ou `SUM(order_items.subtotal)`. Exemplos corretos: `pay_order`, `create_order`, `update_order_items` (todos recalculam).

**REGRA 2 — Mutação em tabelas financeiras/operacionais SÓ via RPC.**
Proibido `supabase.from('orders').update(...)`, `from('products').insert(...)`, `from('settings').update(...)`, `from('cash_register').insert(...)` no client. Use as RPCs:
- Pedidos: `create_order`, `update_order_items`, `update_order_status`, `pay_order`, `move_order_to_table`, `rename_order_table`, `merge_table_duplicates`
- Produtos/Settings: `admin_upsert_product`, `admin_delete_product`, `admin_set_setting` (exigem PIN)
- Caixa: `cash_open`, `cash_close`, `cash_movement_add` (exigem PIN)
- Estoque: `apply_inventory_movement`
- Impressão: `claim_order_print`, `complete_order_print`, `fail_order_print`

**REGRA 3 — Status de pedido segue máquina de estados.**
`update_order_status` só aceita `new|preparing|done|cancelled`. Nunca `paid` (use `pay_order`). Pedido `paid` é imutável.

**REGRA 4 — RPCs administrativas perigosas são service_role only.**
`archive_and_purge_old_data`, `force_clear_orphan_prints`, `recover_stuck_prints`, `requeue_stuck_print_jobs`, `consume_undo_token`: REVOKE de anon/authenticated. Frontend acessa via edge function `admin-rpc` (a criar) que valida PIN.

**REGRA 5 — Edge functions disparadas por pg_cron exigem `X-Cron-Secret`.**
`notify-telegram`, `daily-waiter-report`, `check-stale-tables`: comparar com `safeEqual` contra `CRON_SECRET`. Webhook do Telegram já exige `X-Telegram-Bot-Api-Secret-Token` (Ciclo 1).

**REGRA 6 — Campos livres do usuário em mensagens HTML são escapados.**
Antes de injetar `note`, `table_name`, `waiter_name`, `customer_name`, `delta.product_name` em `sendMessage` com `parse_mode: HTML`, escapar `& < >` e truncar a 200 chars.

## Status das 20 vulnerabilidades do Ciclo 2

| # | Componente | Status |
|---|---|---|
| A1 | `pay_order` trust em `amount_paid` | **CORRIGIDO** — recalcula `total` e valida (lock, mismatch, insufficient_cash) |
| A2 | `create_order`/`update_order_items` `subtotal` do client | **CORRIGIDO** — recalcula a partir de `products.price` |
| A3 | `update_order_status` aceitava qualquer string | **CORRIGIDO** — máquina de estados, bloqueia `'paid'` |
| A4 | `Kitchen.tsx` `from('orders').update({status})` | **PENDENTE FRONTEND** — RLS já bloqueia o update direto, frontend precisa migrar para `rpc('update_order_status')` no próximo ciclo |
| A5 | `orders` UPDATE público | **CORRIGIDO** — só SELECT público |
| A6 | `products` ALL público | **CORRIGIDO** — só SELECT; mutação via `admin_upsert_product` |
| A7 | `cash_register`/`cash_movements` ALL público | **CORRIGIDO** — só SELECT; mutação via `cash_open`/`cash_close`/`cash_movement_add` |
| A8 | `profiles.pin` em texto plano | **CORRIGIDO** — bcrypt em `pin_hash`, REVOKE da coluna |
| A9 | `settings` ALL público | **CORRIGIDO** — só SELECT; mutação via `admin_set_setting` |
| A10 | `archive_and_purge_old_data` exposto | **CORRIGIDO** — service_role only |
| A11 | `force_clear_orphan_prints` exposto | **CORRIGIDO** — service_role only |
| A12 | `merge_table_duplicates` race | **CORRIGIDO** — `pg_advisory_xact_lock` |
| A13 | `move_order_to_table` | **MITIGADO** — já validava status; ainda público (parte do fluxo legítimo de garçom) |
| A14 | `notify-telegram` sem auth | **PENDENTE EDGE FN** — adicionar `X-Cron-Secret` |
| A15 | `daily-waiter-report` sem auth | **PENDENTE EDGE FN** |
| A16 | `check-stale-tables` sem auth | **PENDENTE EDGE FN** |
| A17 | HTML injection via campos livres | **PENDENTE EDGE FN** — helper `escapeTelegramHtml` |
| A18 | Replay de undo do Telegram | **PARCIAL** — `consume_undo_token` criado; webhook precisa usar |
| A19 | `pay_order` sem lock | **CORRIGIDO** — `FOR UPDATE` |
| A20 | `apply_inventory_movement` sem teto | **CORRIGIDO** — qty ≤ 10000, stock ≥ -1000 |

## Riscos residuais conhecidos

- **PIN 4 dígitos é fator único**. Mitigação: rate-limit 5 falhas / 15min. Recomendação futura: migrar para Supabase Auth (magic link) para gerentes.
- **Frontend ainda assume mutação direta em algumas rotas** (Kitchen, Admin de produtos, SystemTab, ProductGroups) — vai falhar até refactor do próximo ciclo. RLS protege os dados; UX precisa atualizar.
- **`pgcrypto` em schema `extensions`** — linter pode ainda reportar (warning aceito, instalação inicial em public foi movida).
- **Ataque interno** (alguém com PIN válido) — fora do escopo técnico.

## Auditoria Ciclo 1 (referência)

- Webhook Telegram exige `X-Telegram-Bot-Api-Secret-Token` (`WEBHOOK_SECRET`) com comparação constant-time.
- Endpoints `?test=*` exigem o mesmo secret e `TEST_MODE=1`.
- Logs no webhook mascaram PII (apenas metadata).
- `normalize_waiter_name` e `update_updated_at_column` com `search_path` fixo.

## Findings de RLS `USING true` em SELECT são aceitos por design.
POS sem auth precisa ler dados em todos os dispositivos da rede local. Linter findings `SUPA_rls_policy_always_true` em policies SELECT e `SUPA_function_search_path_mutable` em funções legadas são aceitos.
