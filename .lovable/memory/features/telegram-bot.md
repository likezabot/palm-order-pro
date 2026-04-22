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

Parser também aceita variações naturais: "adiciona 1 bovino na mesa 1", "coloca 2 coca na mesa 3", "mesa 2 tira 1 agua", "mesa 1 mais um bovino", "acrescenta tres bovinos na mesa 2". Operadores ADD: +, add, adiciona(r), coloca(r), poe, manda(r), bota(r), mais, soma(r), inclui(r), acrescenta(r). Operadores REMOVE: -, remove(r), tira(r), retira(r), cancela(r), menos, subtrai(r), exclui(r), desconta(r). Aceita números por extenso 1–10 (um/uma, dois/duas, tres…dez). Sem operador explícito → PARSE_ERROR (nunca chuta).

**Plural simples:** singularize() roda antes de resolveProduct (cocas→coca, bovinos→bovino, aguas→agua, medalhoes→medalhao, pasteis→pastel, garagens→garagem). Conservador: ignora dígitos/unidades, palavras ≤3 letras, e ss final. Não altera ambiguidade — "cocas" → "coca" → fuzzy pede variante.

**Mensagens de erro:** PARSE_ERROR mostra 2 exemplos curtos + ponteiro pra "ajuda". not_found sugere top 3 produtos próximos via match de tokens. ambiguous numera candidatos. is_group_trigger lista variantes em bullets. version_conflict sugere "aguarde 5s".

**Regras v1:**
- NÃO mexe em estoque (consistência com PDV que também não decrementa).
- Whitelist obrigatória: `settings.telegram_allowed_chats` (JSON array de chat_ids ou CSV). Se vazio/ausente, bloqueia tudo.
- Identificação: `Telegram (@username)` ou `Telegram` se sem username.
- Bloqueia mesa "BALCÃO" (só mesas numéricas).
- Em ambíguo nunca chuta — pede reenvio com nome específico.
- Retry 3× em `version_conflict`.
- Dedupe por `update_id` em memória (TTL 5min).

**Aliases de inventory_items:**
- Populados manualmente em `inventory_items.aliases` (TEXT[]) — normalizados (lowercase, sem acento).
- **Aliases curtos ambíguos NÃO entram** — ex: "coca" sozinho não é alias de nenhuma variante (350/600/2L), força o fuzzy fallback a perguntar a variante. Vale para guarana, fanta, etc. quando há múltiplos tamanhos.
- Validação: `SELECT alias, array_agg(name) FROM inventory_items, unnest(aliases) AS alias WHERE is_active GROUP BY alias HAVING count(*)>1` deve retornar 0 linhas.

**Para liberar um chat:** inserir/atualizar `settings` com `key='telegram_allowed_chats'` e `value='[123456789]'`.
