---
name: Telegram bot
description: Bot do Telegram edita pedidos por texto (mesa N + qty produto). Não mexe em estoque. Whitelist em settings.telegram_allowed_chats.
type: feature
---
Edge function `telegram-webhook` permite editar pedidos via texto:
- `mesa N + qty produto` → ADD (cria pedido se não existir, ou update_order_items com print extra)
- `mesa N - qty produto` → REMOVE (sem impressão)
- `mesa N ver pedido` → VIEW
- `ajuda` / `/start` / `/help` → HELP

**Regras v1:**
- NÃO mexe em estoque (consistência com PDV que também não decrementa).
- Whitelist obrigatória: `settings.telegram_allowed_chats` (JSON array de chat_ids ou CSV). Se vazio/ausente, bloqueia tudo.
- Identificação: `Telegram (@username)` ou `Telegram` se sem username.
- Bloqueia mesa "BALCÃO" (só mesas numéricas).
- Em ambíguo nunca chuta — pede reenvio com nome específico.
- Retry 3× em `version_conflict`.
- Dedupe por `update_id` em memória (TTL 5min).

**Para liberar um chat:** inserir/atualizar `settings` com `key='telegram_allowed_chats'` e `value='[123456789]'`.
