---
name: security-rls-public
description: RLS policies are intentionally public (USING true) — POS without auth, by design
type: constraint
---
This is a single-tenant POS (Plano B Espetaria) that runs without user authentication.
All RLS policies are intentionally `USING (true)` so that any device on the local network
can act as waiter/kitchen/cashier. Findings from `security--run_security_scan` and
`supabase--linter` of type `SUPA_rls_policy_always_true` and `SUPA_function_search_path_mutable`
are accepted by design and must not be "fixed" by tightening RLS.

**Why:** Adding auth would block the operational flow (garçom rotativo, dispositivos compartilhados).
**How to apply:** Before any migration, RLS policy change, or security suggestion that proposes
restricting access on `orders`, `order_items`, `products`, `inventory_items`, `cash_register`,
`cash_movements`, `stock_movements`, `profiles`, `settings` — STOP and confirm with the user first.

**What IS in scope for security:**
- Edge functions: validate input (zod), never echo secrets in logs.
- `telegram-webhook`: keep `text` parameters bound (never string-concat into SQL); webhook secret in `WEBHOOK_SECRET`; chat whitelist enforced.
- Service role key: never sent to the client.
- New tables: keep RLS enabled even if policies are permissive — never disable RLS entirely.
