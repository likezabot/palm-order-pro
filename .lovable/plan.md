

# Auditoria de Segurança — Ciclo 2: PDV, RPC, RLS e lógica de negócio

Ciclo 1 fechou o webhook do Telegram. Ciclo 2 ataca o **núcleo do POS**: RPCs do banco, RLS pública, fluxos de pagamento e operações destrutivas expostas ao cliente.

## Escopo do mapeamento

13 arquivos do front chamam **15 RPCs distintas**. 6 arquivos fazem `update/insert/delete` direto em tabelas críticas. 9 tabelas têm RLS `USING true` para `public`. 3 edge functions auxiliares sem auth.

## Mapa de superfície de ataque (restante)

| # | Componente | Risco | Severidade | Hipótese de ataque |
|---|---|---|---|---|
| A1 | `pay_order` RPC | Trust em `p_amount_paid` / `p_payment_method` | **Crítica** | Cliente envia `amount_paid=0` em PIX, marca como pago sem receber |
| A2 | `create_order` / `update_order_items` RPC | `p_total` e `subtotal` calculados no cliente | **Crítica** | Manipular `subtotal` para 0,01 e fechar conta de R$ 200 por 1 centavo |
| A3 | `update_order_status` RPC | Aceita qualquer string, sem máquina de estados | **Alta** | Pular para `'paid'` sem `pay_order` (sem registrar método/valor); voltar `paid` para `new` (RPC barra, mas `from('orders').update` direto não) |
| A4 | `Kitchen.tsx` linha 92 | `from('orders').update({status}).eq('id', x)` direto | **Alta** | RLS pública permite UPDATE em qualquer pedido — incluindo `status='paid'` ou zerar `total` |
| A5 | RLS `orders_update USING true` | Anon key pode reescrever qualquer coluna | **Crítica** | `update({total: 0, payment_method: 'cash', amount_paid: 0, status: 'paid'})` |
| A6 | RLS `products` ALL public | Reprice mass | **Alta** | `from('products').update({price: 0.01})` — ataque DoS comercial |
| A7 | RLS `cash_register` / `cash_movements` ALL public | Falsificação de caixa | **Alta** | Inserir sangria fictícia, reabrir caixa fechado, alterar `final_amount` |
| A8 | RLS `profiles` SELECT public | `pin` exposto | **Crítica** | `select('pin').eq('role','manager')` — pega PIN de gerente em texto plano |
| A9 | RLS `settings` ALL public | Reescrever `telegram_notify_chats`, `telegram_allowed_chats` | **Crítica** | Adicionar próprio chat_id à whitelist do bot e ganhar controle remoto do POS via voz |
| A10 | RPC `archive_and_purge_old_data` exposto ao client | DoS / perda de dados | **Crítica** | Qualquer client chama `rpc("archive_and_purge_old_data", {p_days_keep: 1})` e apaga histórico |
| A11 | RPC `force_clear_orphan_prints` exposto | Trash impressões pendentes | **Média** | Marca pedidos `paid+pending` como `printed` sem imprimir |
| A12 | RPC `merge_table_duplicates` sem rate-limit | Race / corrupção | **Média** | Chamar 50× em paralelo em mesa ativa enquanto garçom adiciona itens |
| A13 | RPC `move_order_to_table` | Sequestro de mesa ativa | **Média** | Mover pedido alheio para mesa fictícia e travar fluxo |
| A14 | Edge `notify-telegram` sem auth | Spam / drain queue | **Média** | Invocar 1000× em loop, esgotar cota Telegram |
| A15 | Edge `daily-waiter-report` sem auth | Disparo arbitrário | **Baixa** | Forçar relatório de qualquer data, vazando faturamento por garçom para qualquer chat configurado |
| A16 | Edge `check-stale-tables` sem auth | Spam de notificações | **Baixa** | Forçar disparo em loop |
| A17 | `note` / `table_name` / `customer_name` livres | HTML/script via Telegram | **Média** | `note='<a href=evil>x</a>'` flui para `sendMessage` com `parse_mode: HTML` em todos os chats whitelistados |
| A18 | Webhook Telegram — `voice_resolve` state | Replay de undo | **Baixa** | Reusar token de undo em janela de 60s para reverter ação alheia |
| A19 | `pay_order` sem idempotência | Pagamento duplicado por race | **Média** | Double-tap dispara 2 RPC; segunda recebe `order_already_paid` (OK), mas e se cliente desabilita guard? |
| A20 | `apply_inventory_movement` sem teto | Estoque negativo arbitrário | **Baixa** | `p_type='out', p_quantity=999999` zera/negativa estoque |

## Matriz de ameaças (resumida)

- **Autorização**: A4–A10 — RLS pública é o problema raiz. Todos os controles "admin" no front são teatro.
- **Lógica de negócio**: A1, A2, A3, A19 — preço/total/status confiados ao cliente.
- **API/RPC**: A10, A11, A14–A16 — RPCs/funções destrutivas sem gate de role.
- **Banco/RLS**: A5–A9 — `USING true` em tabelas com dados sensíveis e financeiros.
- **Integrações**: A14, A17 — broadcast Telegram sem assinatura nem sanitização.
- **Concorrência**: A12, A18, A19.

## Plano de correção (TDD onde viável)

### Fase 1 — Cortar privilege escalation crítica (A1, A2, A5, A8, A9)

**Migração SQL — recálculo no servidor + RLS apertada:**

1. **`pay_order` recalcula total no servidor** e valida `amount_paid`:
   ```sql
   -- Dentro de pay_order, antes do UPDATE:
   SELECT COALESCE(SUM(subtotal),0) INTO v_real_total FROM order_items WHERE order_id = p_order_id;
   IF abs(v_real_total - p_amount_paid) > 0.01 AND p_payment_method <> 'cash' THEN
     RAISE EXCEPTION 'amount_mismatch: expected % got %', v_real_total, p_amount_paid;
   END IF;
   IF p_payment_method = 'cash' AND p_amount_paid + 0.001 < v_real_total THEN
     RAISE EXCEPTION 'insufficient_cash';
   END IF;
   IF p_payment_method NOT IN ('cash','pix','card','credit','debit','none') THEN
     RAISE EXCEPTION 'invalid_payment_method';
   END IF;
   ```
   Mantém `'none'` (fechamento sem pagamento explícito do bar) mas força `amount_paid = total` recalculado.

2. **`create_order` / `update_order_items` recalculam `total` e `subtotal`** a partir de `products.price` (lookup por `product_id`), descartando o que veio do client. Para itens sem `product_id` (custom), aceita o `product_price` enviado mas registra flag `manual_price=true` em log futuro.

3. **`update_order_status` valida transições**:
   ```sql
   IF p_status NOT IN ('new','preparing','done','cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;
   IF v_current = 'paid' THEN RAISE EXCEPTION 'cannot_change_paid'; END IF;
   -- bloqueia 'paid' aqui — só pay_order pode setar
   IF p_status = 'paid' THEN RAISE EXCEPTION 'use_pay_order'; END IF;
   ```

4. **Fechar RLS de mutação** em `orders`, `order_items`, `products`, `cash_register`, `cash_movements`, `inventory_items`, `inventory_movements`, `settings`, `profiles`. Estratégia minimamente invasiva (sistema é POS sem auth):
   - **SELECT**: `public` permanece `true` (POS precisa ler).
   - **INSERT/UPDATE/DELETE**: revogar `public`, exigir que mutações passem por **RPC SECURITY DEFINER**. RPCs já existem para o caminho legítimo (`create_order`, `update_order_items`, `pay_order`, `update_order_status`, `apply_inventory_movement`).
   - Para tabelas que ainda fazem write direto do client (`products` no Admin, `settings`, `cash_register`/`cash_movements`), criar RPCs equivalentes: `admin_upsert_product`, `admin_set_setting`, `cash_open`, `cash_close`, `cash_movement_add`. Essas RPCs **exigem PIN de gerente** validado por nova função `verify_manager_pin(p_pin text) returns boolean` — tabela `profiles.pin` muda de `text` plano para `pin_hash` (bcrypt via pgcrypto) na mesma migração.

5. **`profiles.pin` → `pin_hash`**: migração one-shot, hash dos PINs existentes com `crypt(pin, gen_salt('bf'))`. Coluna `pin` é dropada. RLS `profiles` SELECT passa a expor só `id, name, role` (view `public.profiles_safe` ou policy com `USING true` mas coluna `pin_hash` revogada do role anon via `REVOKE SELECT (pin_hash) ON profiles FROM anon, authenticated`).

6. **`Kitchen.tsx` substitui `from('orders').update({status})` por `rpc('update_order_status', ...)`** (que agora valida).

### Fase 2 — Lockdown de RPCs administrativas (A10, A11)

7. **`archive_and_purge_old_data`, `force_clear_orphan_prints`, `recover_stuck_prints`, `requeue_stuck_print_jobs`**: mover de `EXECUTE TO public` para `EXECUTE TO service_role` apenas. Frontend que precisava (SystemTab) chama via edge function nova `admin-rpc` que valida PIN de gerente.

### Fase 3 — Edge functions auxiliares (A14–A16)

8. **`notify-telegram`, `daily-waiter-report`, `check-stale-tables`**: exigir header `X-Cron-Secret` (novo secret `CRON_SECRET`) com `safeEqual`. pg_cron passa o header. Se ausente/errado → 401.

### Fase 4 — Sanitização de campos livres (A17)

9. **Helper `escapeTelegramHtml(s)`** no webhook e no `notify-telegram`: substitui `&<>` por entidades antes de injetar `note`, `table_name`, `waiter_name`, `customer_name`, `delta.product_name` em mensagens com `parse_mode: HTML`. Limite hard 200 chars por campo.

### Fase 5 — Hardening geral (A12, A13, A18, A19, A20)

10. **`apply_inventory_movement`**: limite `p_quantity <= 10000`; `current_stock` resultante não pode ficar abaixo de `-1000`.
11. **`merge_table_duplicates`**: já tem `FOR UPDATE`, ok. Adicionar advisory lock `pg_advisory_xact_lock(hashtext('merge:' || p_table_name))` para serializar.
12. **`pay_order`**: adicionar `FOR UPDATE` no SELECT inicial (hoje não tem) para fechar race de double-pay.
13. **Telegram undo**: marcar token como `consumed_at` no banco antes de executar reversão; rejeitar se já consumido.

## Camada de testes

### Deno (webhook + RPCs via service_role)
- `supabase/functions/_shared_test/rpc_security_test.ts` (novo) — chama RPCs com payload malicioso usando service_role e anon, valida que anon não consegue escrever direto:
  - `pay_order` com `amount_paid=0` em PIX → `amount_mismatch`
  - `create_order` com `subtotal` adulterado → recalcula
  - `update_order_status` com `'paid'` → `use_pay_order`
  - anon `from('orders').update({total: 0})` → policy bloqueia
  - anon `from('profiles').select('pin_hash')` → coluna não retorna
  - anon `rpc('archive_and_purge_old_data')` → permission denied
  - `notify-telegram` sem `X-Cron-Secret` → 401

### Vitest (frontend)
- `src/lib/__tests__/payment-server-validation.test.ts` — mock supabase: garante que `CloseOrder` envia `amount_paid` mas espera erro `amount_mismatch` se cálculo divergir.
- `src/lib/__tests__/admin-pin-rpc.test.ts` — admin operations passam pelo `admin-rpc` com PIN.

### Smoke ofensivo
- `supabase/functions/telegram-webhook/replay_test.ts` — token de undo consumido 2× na janela → segunda chamada rejeitada.
- `supabase/functions/telegram-webhook/html_inject_test.ts` — `note` com `<script>` é escapado antes do `sendMessage`.

## Documentação obrigatória (entrega ao final)

Atualizar `.lovable/memory/preferences/security.md` com:
- Lista das 20 hipóteses, status (corrigido / mitigado / ignorado com justificativa).
- Regra: **toda nova RPC SECURITY DEFINER deve recalcular valores monetários e validar transições de status**.
- Regra: **mutações em tabelas financeiras só via RPC; nunca `from(...).update(...)` no client**.

E criar `.lovable/security/audit-cycle-2.md` com o relatório completo no formato obrigatório (uma seção por vulnerabilidade A1–A20 com Severidade/Local/Como explorar/Payload/Causa raiz/Correção/Teste/Risco residual).

## Arquivos afetados

**Migrações SQL** (1 grande, transacional):
- Reescreve `pay_order`, `create_order`, `update_order_items`, `update_order_status`, `apply_inventory_movement`, `merge_table_duplicates`.
- Cria `verify_manager_pin`, `admin_upsert_product`, `admin_set_setting`, `cash_open`, `cash_close`, `cash_movement_add`, `consume_undo_token`.
- Migra `profiles.pin` → `profiles.pin_hash` (pgcrypto).
- Substitui RLS public ALL por RLS public SELECT + `REVOKE INSERT/UPDATE/DELETE FROM anon, authenticated` em 9 tabelas.
- `REVOKE EXECUTE ... FROM public` em RPCs administrativas.
- Drop policies permissivas redundantes.

**Edge functions**:
- `supabase/functions/notify-telegram/index.ts` — exige `CRON_SECRET`, escapa HTML.
- `supabase/functions/daily-waiter-report/index.ts` — exige `CRON_SECRET`.
- `supabase/functions/check-stale-tables/index.ts` — exige `CRON_SECRET`.
- `supabase/functions/admin-rpc/index.ts` (novo) — proxy para RPCs admin, valida PIN via `verify_manager_pin`.
- `supabase/functions/telegram-webhook/index.ts` — escape HTML em campos livres, undo com `consume_undo_token`.

**Frontend**:
- `src/pages/Kitchen.tsx` — usa `update_order_status` RPC.
- `src/pages/Admin.tsx`, `src/components/admin/ProductsManager.tsx`, `src/components/admin/ProductForm.tsx` — chamam `admin-rpc` com PIN.
- `src/components/admin/SystemTab.tsx` — `archive_and_purge_old_data` via `admin-rpc`.
- `src/lib/product-groups.ts`, `src/lib/product-order.ts` — `admin_set_setting` via `admin-rpc`.
- `src/components/print-station/PrintQueuePanel.tsx` — `force_clear_orphan_prints` via `admin-rpc`.
- Login de gerente / cache de PIN em `sessionStorage` (não localStorage; expira ao fechar aba).

**Testes**: ~10 arquivos novos.

**Secrets a adicionar pelo usuário**:
- `CRON_SECRET` (random 32 bytes) — depois de criar, usuário precisa atualizar headers do pg_cron que dispara `notify-telegram` e `daily-waiter-report`.

## Critério de aceite

1. Anon key NÃO consegue: alterar `orders.total`, ler `profiles.pin_hash`, executar `archive_and_purge_old_data`, modificar `settings.telegram_allowed_chats`, alterar `products.price` sem PIN.
2. `pay_order` rejeita `amount_paid` divergente do total recalculado.
3. `update_order_status` rejeita `'paid'`.
4. `notify-telegram` retorna 401 sem `X-Cron-Secret`.
5. Campos com `<script>` chegam escapados nos chats Telegram.
6. Token de undo só executa 1×.
7. Build passa, todos os 114 testes anteriores + ~25 novos passam.
8. Fluxos legítimos (lançar pedido, fechar conta, imprimir, mover mesa, voz Telegram) continuam funcionando.
9. Relatório `audit-cycle-2.md` entregue com 20 vulnerabilidades documentadas no formato obrigatório.

## Observações sobre o ambiente

- **POS sem login de usuário**: o app continua acessível sem auth (proposta operacional). A camada de proteção é via **RLS read-only para anon + RPC com PIN para mutação sensível**, não via JWT por usuário.
- **PIN é o único fator** — não é ideal, mas é o que cabe sem reformar todo o login. Documentado como risco residual; recomendação futura é migrar para auth real (Supabase Auth com magic link) para garçons/gerentes.
- **Riscos residuais conhecidos**: ataque interno (alguém com PIN), brute force de PIN 4 dígitos (mitigar com rate limit por IP em `verify_manager_pin` — 5 tentativas / 15min), perda de dispositivo logado.

