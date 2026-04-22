# Memory: index.md
Updated: now

# Project Memory

## Core
Dark theme POS system for Plano B Espetaria. Primary #E25822 (laranja brasa), bg #0D0D0D.
Inter font, min 14px text, min 56px button height. Border radius 12px.
No auth - open RLS for POS system. Supabase Realtime for orders.
Portuguese (pt-BR) interface. PWA installable.
Bot do Telegram edita pedidos por texto, não mexe em estoque, exige whitelist em settings.telegram_allowed_chats.

## Memories
- [Design tokens](mem://design/tokens) — Dark theme colors, success/warning/destructive semantic tokens
- [Menu data](mem://features/menu) — Full cardápio: Refeições, Espetos, Bebidas, Cervejas with prices
- [System modules](mem://features/modules) — 5 modules: Home, Palm (waiter), Kitchen (kanban), Cashier, Admin
- [Telegram bot](mem://features/telegram-bot) — Edge function telegram-webhook: comandos de texto, whitelist, sem estoque
- [Telegram notifications](mem://features/telegram-notifications) — Feed operacional no grupo: pedidos/pagamentos/estoque crítico + relatório diário 00:00 BRT
