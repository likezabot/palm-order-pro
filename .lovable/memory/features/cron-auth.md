---
name: cron-auth
description: Edge functions notify-telegram, check-stale-tables, daily-waiter-report — gate REVERTIDO temporariamente (Ciclo 2.1 hotfix); reimplementação pendente via vault
type: feature
---

# Autenticação dos crons Telegram — ESTADO ATUAL (Ciclo 2.1)

## ⚠️ Gate REVERTIDO (hotfix)

`ALTER ROLE postgres SET app.cron_secret` falha no Supabase Cloud com `permission denied`.
Sem o GUC, os crons batiam 401 e as notificações Telegram pararam.

**Hotfix aplicado:** `checkCronAuth()` nas 3 fns agora retorna `null` (libera passagem)
mesmo sem header. Continua aceitando `X-Cron-Secret` e `Authorization: Bearer SERVICE_ROLE_KEY`
quando presentes — apenas não rejeita mais quando ausentes.

Crons voltaram a funcionar. Operação POS nunca foi afetada (não depende dessas fns).

## Reimplementação correta (pendente)

Usar **Supabase Vault** (suportado nativamente em Cloud, sem precisar de GUC):

```sql
-- 1. Salvar secret no Vault (via Cloud UI ou SQL)
SELECT vault.create_secret('<valor>', 'cron_secret');

-- 2. No cron, ler do Vault em runtime
SELECT cron.schedule(
  'drain-notification-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/notify-telegram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

3. Depois que o cron estiver enviando o header, remover o `return null` final
   do `checkCronAuth()` nas 3 fns para reativar o 401.

## Validação extra em daily-waiter-report (mantida)

`?date=YYYY-MM-DD` validado contra `/^\d{4}-\d{2}-\d{2}$/`.
