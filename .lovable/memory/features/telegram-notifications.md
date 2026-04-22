---
name: telegram-notifications
description: Sistema de notificações operacionais no grupo Telegram (Fases 1-3) + relatório diário de garçons + comandos de consulta
type: feature
---

## Fase 1 — eventos
- 🆕 Novo pedido / 🔄 Acréscimo (delta_items) / ✅ Pago (triggers em `orders`)
- ⚠️ Estoque crítico / 🚨 Item zerado (trigger em `inventory_movements`)

## Fase 2 — eventos
- 🖨️ Falha de impressão (trigger AFTER UPDATE em `orders` quando `print_status` volta a `pending` com erro)
- 🔁 Mesa renomeada/movida (trigger em `orders` quando `table_name` muda em pedido ativo)
- 📦 Entrada de estoque (trigger em `inventory_movements` movement_type='in', janela 30s)

## Fase 3 — eventos + comandos
- 💰 Caixa fechado (trigger `queue_cash_closed` em `cash_register`): calcula vendas/sangrias/suprimentos/esperado/diferença a partir de `cash_movements`. Sangria = type IN ('sangria','withdrawal','out'); Suprimento = ('suprimento','supply','in').
- ⏰ Mesa parada (edge function `check-stale-tables`, cron `*/15 * * * *`): `done` >30min OU `new`/`preparing` com `updated_at` >60min. Dedup por bucket de 15min via `notification_log.dedupe_key`.
- 📋 Comando `mesa N status` / `status N`: resumo curto (garçom, tempos, itens, total, status).

## Arquitetura
- Triggers SQL apenas **enfileiram** em `notification_queue` com `consolidate_key` + `send_after`.
- Cron `drain-notification-queue` (1min) chama `notify-telegram`.
- `notify-telegram` agrupa por `consolidate_key`, mantém o mais recente, envia, grava `notification_log` (idempotência via `dedupe_key`).
- Settings: `telegram_notify_chats` (lista chat_ids), `telegram_notify_config` (flags `orders`/`payments`/`stock_critical`/`daily_report`/`print_failure`/`stock_in`/`cash_closed`/`stale_tables`).

## Relatório diário
- Cron `daily-waiter-report` `0 3 * * *` UTC (00:00 BRT), processa dia anterior.
- Padroniza `waiter_name` via `normalize_waiter_name` para evitar duplicatas por grafia.
- Aceita `?date=YYYY-MM-DD` para reprocessar.

## Comandos no bot
- `relatório` / `ranking` / `fechamento` — dispara relatório do dia
- `estoque crítico` — lista itens abaixo do mínimo
- `notificações on/off` — toggle de todo o feed
- `mesa N status` / `status N` — resumo curto da mesa
- `mesa N ver pedido` — detalhe completo (não confundir com status)

## Grupo autorizado
- Chat ID `-1003464296947` ("Plano B Operacional") em `telegram_allowed_chats` e `telegram_notify_chats`.
