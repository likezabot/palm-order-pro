---
name: Telegram bot
description: Bot do Telegram (texto/voz) edita pedidos por mesa, controla estoque (entrada/saida/ajuste/consulta + wizard) e CONTROLA VISIBILIDADE DE PRODUTOS (ocultar/mostrar/listar). Whitelist em settings.telegram_allowed_chats. Voz transcrita por Lovable AI (Gemini 2.5 Flash).
type: feature
---

Edge function `telegram-webhook`. Whitelist obrigatória (`settings.telegram_allowed_chats`). Vinculação por usuário (`telegram_user_bindings`).

## Pedidos
- `mesa N + qty produto` → ADD
- `mesa N - qty produto` → REMOVE
- `mesa N` → SET_TABLE (15 min de contexto)
- `mesa N ver pedido` → VIEW
- Atalhos pós-contexto: `mais 1 coca`, `tira uma agua`, `ver pedido`.

## Estoque (texto)
- `entrada/repor/abasteci/chegou 10 coca` → STOCK_MOVEMENT in
- `saida/usei/vendi/quebrou 2 coca` → STOCK_MOVEMENT out
- `ajuste/contei/setar/marca coca 50`, `tem 12 coca` → adjustment
- `acabou X / terminou X / sem X` → STOCK_OUT_NOW (zera direto, com botão ↩️ Desfazer)
- `estoque coca / quanto tem de coca` → STOCK_QUERY
- `estoque / criticos / alertas` → STOCK_CRITICAL
- `lista estoque / inventario` → STOCK_LIST

## Estoque (wizard rico)
Gatilhos: `gerenciar estoque`, `menu estoque`, `contagem`. State em `telegram_chat_state` (chat_id PK). Steps: main_menu, awaiting_item, awaiting_search, awaiting_qty(_text), awaiting_review, awaiting_mass_review, cart_*. Callbacks `wz|...`. Undo via `us|<token>` (60s).

## Cardápio (visibilidade) — NOVO
Comandos para alternar `products.active` sem entrar no Admin. Sincroniza Admin/Palm via Supabase Realtime na tabela `products` (subscriptions em `MenuView.tsx` e `Admin.tsx`).

- **Ocultar**: `ocultar X`, `oculta X`, `esconder X`, `desativar X`, `desabilitar X`, `inativar X`, `tirar X do cardapio`, `remover X do cardapio` → `PRODUCT_HIDE`
- **Mostrar**: `mostrar X`, `ativar X`, `exibir X`, `habilitar X`, `reativar X`, `liberar X`, `colocar X no cardapio`, `voltar X ao cardapio`, `botar X no cardapio` → `PRODUCT_SHOW`
- **Listar**: `listar ocultos / ver ocultos / listar escondidos / listar desativados` → `PRODUCT_LIST hidden`; `listar visiveis / listar ativos / listar cardapio / listar menu / listar produtos` → `PRODUCT_LIST visible`.
- **Disambiguação**: se `fuzzyFindProducts(query)` retorna >1 match (até 9), bot grava `wzSet(chatId, "product_pick", { product_pick: { action, candidates } })` (TTL 5min) e pede número. `1`-`9` puro vira `PRODUCT_PICK choice` e aplica.
- **Fuzzy**: normaliza+singulariza, ranking exato>startsWith>includes>tokens-all-includes>Levenshtein por token.
- **Restrições**: bot só altera `active`. NÃO deleta produto, não muda preço/categoria, não toca pedidos/impressão. `tirar X` só vira HIDE com sufixo `do/de cardapio` (evita conflito com `tirei X` do estoque).
- **Logs**: `[telegram-product] <kind> query: ... matches: N` e `updated <id> active=<bool>`.

## Voz
Áudio (OGG/Opus) → Lovable AI Gemini 2.5 Flash → roda no mesmo parser. Confirmação híbrida: leitura/pedido/visibilidade/STOCK_OUT_NOW executam direto com prefixo "🎤 Ouvi: ..."; `STOCK_MOVEMENT` pede botão ✅/❌ (state `voice_confirm`, callbacks `vc|ok|<token>` / `vc|no|<token>`).

## Realtime publication
Tabelas em `supabase_realtime`: `inventory_items`, `products` (idempotente via `DO $$ ... EXCEPTION WHEN duplicate_object`).

## Para liberar um chat
Insere/atualiza `settings` com `key='telegram_allowed_chats'`, `value='[123456789]'`.
