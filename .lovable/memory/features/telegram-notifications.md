---
name: telegram-notifications
description: Sistema de notificações operacionais no grupo Telegram (Fase 1) + relatório diário de garçons
type: feature
---

## Fase 1 — eventos ativos
- 🆕 Novo pedido (trigger AFTER INSERT em `orders`)
- 🔄 Acréscimo/remoção consolidado (trigger AFTER UPDATE em `orders` quando `delta_items` muda)
- ✅ Pago (trigger AFTER UPDATE quando `status` vira `paid`)
- ⚠️ Estoque crítico / 🚨 Item zerado (trigger AFTER INSERT em `inventory_movements`)

## Arquitetura
- Triggers SQL apenas **enfileiram** em `notification_queue` (não chamam HTTP) com `consolidate_key` + `send_after` (janela 2-8s).
- Cron `drain-notification-queue` roda a cada minuto e chama `notify-telegram`.
- `notify-telegram` agrupa por `consolidate_key`, mantém o evento mais recente (consolidação confiável em DB, não em memória), envia e grava em `notification_log` (idempotência via `dedupe_key`).
- Settings: `telegram_notify_chats` (lista de chat_ids), `telegram_notify_config` (flags `orders`/`payments`/`stock_critical`/`daily_report`).

## Relatório diário
- Cron `daily-waiter-report` roda `0 3 * * *` UTC (= 00:00 BRT), processa o dia anterior.
- Padroniza `waiter_name` via `normalize_waiter_name` (lowercase + sem acentos) para evitar duplicatas por grafia.
- Função `daily-waiter-report` aceita `?date=YYYY-MM-DD` para reprocessar.

## Comandos novos no bot
- `relatório` / `ranking` / `fechamento` — dispara relatório do dia
- `estoque crítico` — lista itens abaixo do mínimo
- `notificações on/off` — toggle do feed (atualiza `telegram_notify_config`)

## Grupo autorizado
- Chat ID `-1003464296947` ("Plano B Operacional") em `telegram_allowed_chats` e `telegram_notify_chats`.
