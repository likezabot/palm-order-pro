# Memory: index.md
Updated: now

# Project Memory

## Core
Dark theme POS system for Plano B Espetaria. Primary #E25822 (laranja brasa), bg #0D0D0D.
Inter font, min 14px text, min 56px button height. Border radius 12px.
No auth - open RLS for POS system (by design). Supabase Realtime for orders.
Portuguese (pt-BR) interface. PWA installable.
Never re-add auth or tighten RLS without explicit user confirmation.

## Memories
- [Design tokens](mem://design/tokens) — Dark theme colors, success/warning/destructive semantic tokens
- [Menu data](mem://features/menu) — Full cardápio: Refeições, Espetos, Bebidas, Cervejas with prices
- [System modules](mem://features/modules) — 5 modules: Home, Palm (waiter), Kitchen (kanban), Cashier, Admin
- [Telegram bot](mem://features/telegram-bot) — Voice + text commands, multi-message per table, identified Undo
- [Telegram notifications](mem://features/telegram-notifications) — Queue-based notifications via notify-telegram
- [Security policy](mem://preferences/security) — RLS intentionally public; what IS in scope to harden
- [Cron auth](mem://features/cron-auth) — Gate por X-Cron-Secret/Service Role nos 3 crons Telegram
