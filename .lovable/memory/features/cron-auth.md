---
name: cron-auth
description: Edge functions notify-telegram, check-stale-tables, daily-waiter-report — gate por CRON_SECRET + cron precisa de app.cron_secret GUC
type: feature
---

# Autenticação dos crons Telegram (Ciclo 2 — A14/A15/A16)

As 3 edge functions agendadas pelo `pg_cron` têm gate de auth por header.

## Como o gate valida (mesma função `checkCronAuth` nas 3 fns)

Aceita 2 caminhos (constant-time `safeEqual`):
1. `X-Cron-Secret: <CRON_SECRET>` — **preferencial**
2. `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` — fallback

Sem nenhum dos dois → 401 `{"ok":false,"error":"unauthorized"}`.

## Cron jobs (atualizados no banco, NÃO em migration porque contém URL/keys)

Todos os 3 (`drain-notification-queue`, `check-stale-tables`, `daily-waiter-report`)
agora enviam:

```
'X-Cron-Secret', current_setting('app.cron_secret', true)
```

Para os crons funcionarem, o operador precisa rodar UMA vez no SQL Editor:

```sql
ALTER ROLE postgres SET app.cron_secret = '<mesmo valor do secret CRON_SECRET>';
SELECT pg_reload_conf();
```

(Não usar `ALTER DATABASE postgres` — proibido.)

Enquanto isso não for feito, os crons batem 401 e ficam silenciosos.
A operação POS NÃO é afetada (só notificações Telegram param).

## Validação extra em daily-waiter-report

`?date=YYYY-MM-DD` é validado contra `/^\d{4}-\d{2}-\d{2}$/` antes de uso.
Param inválido → ignorado, usa default (dia anterior em BRT).
