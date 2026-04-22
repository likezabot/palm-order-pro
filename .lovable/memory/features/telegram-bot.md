---
name: Telegram bot
description: Bot do Telegram edita pedidos por texto (mesa N + qty produto). Não mexe em estoque. Whitelist em settings.telegram_allowed_chats.
type: feature
---
Edge function `telegram-webhook` permite editar pedidos via texto:
- `mesa N + qty produto` → ADD (cria pedido se não existir, ou update_order_items com print extra)
- `mesa N - qty produto` → REMOVE (sem impressão)
- `mesa N ver pedido` → VIEW (também aceita variações naturais — ver abaixo)
- `ajuda` / `/start` / `/help` → HELP

**Gatilhos VIEW naturais:** parser detecta VIEW antes de ADD/REMOVE. Requer `mesa N` + 1 gatilho, SEM operador ADD/REMOVE e SEM padrão `<qty> <produto>` (senão segue ADD/REMOVE — preserva "sem chute"). Tokens: ver/ve, consulta/consultar/consulte, total/totais, pedido/pedidos, mostra/mostrar/mostre, lista/listar/liste, resumo, extrato, conta, quanto. Frases compostas (includes): "como esta", "como ta", "como anda". Cobre "mesa 1 consulta", "consultar mesa 1", "total mesa 1", "como está a mesa 1", "quanto deu a mesa 3". `mesa 1 mais 1 coca` continua ADD.

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
- **Multi-comando:** mensagem é split por `\n`, 1 comando por linha, máx 10 linhas, execução estritamente sequencial. Falha de uma linha não bloqueia as outras (try/catch por linha). 1 linha = comportamento original sem cabeçalho. 2+ linhas = resposta consolidada com header `📊 N comandos processados:`.
- **Modo preview (dry-run):** se a 1ª linha começa com `preview` (case-insensitive), o bot remove o token, passa cada linha por `previewCommand` e responde como interpretaria SEM mutações. Resolve produto (não_found/ambiguous/found) mas NÃO chama executeAdd/Remove/View. Header `🔍 Preview de N comandos (nada foi executado):`. Preview NUNCA emite botões inline.
- **Auto-pick determinístico:** antes de devolver `ambiguous`/`is_group_trigger`, `autoPickFromCandidates` ranqueia candidatos por tokens do texto: tamanho (350/600/1l/2l/473/269) vale ±10, modificadores (zero/diet/light/lata/longneck/gelada) ±5, palavras livres ≥3 letras +1. Se usuário NÃO mencionou zero/diet/light, candidato com esses modificadores é penalizado (−5). Vencedor só é escolhido se score>0 E folga ≥5 sobre 2º; senão pergunta. Ex: "coca 350"→Coca 350 (auto), "coca zero 350"→Coca Zero 350 (auto), "coca"→pergunta com botões.
- **Botões inline (callback_query):** quando ambíguo persiste após auto-pick, bot envia `inline_keyboard` (1 botão por candidato, máx 8, +Cancelar). Texto do botão: `Nx Nome — R$ X,XX`. `callback_data` formato compacto `a|<table>|<product_uuid>|<qty>` (ADD), `r|...` (REMOVE), `x` (cancelar). Webhook trata `update.callback_query`: valida UUID/qty (1–99), busca product por id, chama executeAdd/Remove com waiter `Telegram (@user) [botão]`, chama `answerCallbackQuery` + `editMessageText` (substitui botões pelo resultado). Dedupe de callback_id (TTL 5min). Em multi-comando, ambíguos viram mensagens separadas com botões abaixo do resumo consolidado.

**Aliases de inventory_items:**
- Populados manualmente em `inventory_items.aliases` (TEXT[]) — normalizados (lowercase, sem acento).
- **Aliases curtos ambíguos NÃO entram** — ex: "coca" sozinho não é alias de nenhuma variante (350/600/2L), força o fuzzy fallback a perguntar a variante. Vale para guarana, fanta, etc. quando há múltiplos tamanhos.
- Validação: `SELECT alias, array_agg(name) FROM inventory_items, unnest(aliases) AS alias WHERE is_active GROUP BY alias HAVING count(*)>1` deve retornar 0 linhas.

**Para liberar um chat:** inserir/atualizar `settings` com `key='telegram_allowed_chats'` e `value='[123456789]'`.
