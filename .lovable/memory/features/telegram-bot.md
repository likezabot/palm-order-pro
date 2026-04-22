---
name: Telegram bot
description: Bot do Telegram edita pedidos por texto (mesa N + qty produto). Não mexe em estoque. Whitelist em settings.telegram_allowed_chats. Suporta batch consolidado, undo 60s, fuzzy match, rate-limit best-effort, contexto por usuário em grupos, SET_TABLE, sugestões clicáveis e status de impressão.
type: feature
---
Edge function `telegram-webhook` permite editar pedidos via texto:
- `mesa N + qty produto` → ADD (cria pedido se não existir, ou update_order_items com print extra)
- `mesa N - qty produto` → REMOVE (sem impressão)
- `mesa N ver pedido` → VIEW (também aceita variações naturais — ver abaixo)
- `mesa N` → SET_TABLE (fixa contexto sem executar; resposta `📍 Mesa N definida para os próximos comandos (15 min).`)
- `ajuda` / `/start` / `/help` → HELP

**Gatilhos VIEW naturais:** parser detecta VIEW antes de ADD/REMOVE. Requer `mesa N` + 1 gatilho, SEM operador ADD/REMOVE e SEM padrão `<qty> <produto>`. Tokens: ver/ve, consulta/consultar/consulte, total/totais, pedido/pedidos, mostra/mostrar/mostre, lista/listar/liste, resumo, extrato, conta, quanto. Frases compostas (includes): "como esta", "como ta", "como anda".

Parser também aceita variações naturais: "adiciona 1 bovino na mesa 1", "coloca 2 coca na mesa 3", "mesa 2 tira 1 agua", "mesa 1 mais um bovino", "acrescenta tres bovinos na mesa 2". Operadores ADD: +, add, adiciona(r), coloca(r), poe, manda(r), bota(r), mais, soma(r), inclui(r), acrescenta(r). Operadores REMOVE: -, remove(r), tira(r), retira(r), cancela(r), menos, subtrai(r), exclui(r), desconta(r). Aceita números por extenso 1–10. Sem operador explícito → PARSE_ERROR (nunca chuta).

**Plural simples:** singularize() roda antes de resolveProduct (cocas→coca, bovinos→bovino, aguas→agua, medalhoes→medalhao, pasteis→pastel, garagens→garagem). Conservador.

**Mensagens de erro PARSE_ERROR:** detecta hint (`no_op` quando tem mesa sem operador, `no_product` quando tem operador sem mesa, `generic`) e ajusta a explicação. Sempre mostra 3 exemplos curtos + ponteiro pra "ajuda". `not_found` agora vira **botões clicáveis** com sugestões (top 3 produtos via match de tokens) — usa o mesmo formato `a|<table>|<product_id>|<qty>` ou `r|...`. Em comando turbo sem mesa (sem contexto), continua sem botões. `ambiguous` numera candidatos. `is_group_trigger` lista variantes em bullets ou botões. `version_conflict` sugere "aguarde 5s".

**Regras v1:**
- NÃO mexe em estoque (consistência com PDV).
- Whitelist obrigatória: `settings.telegram_allowed_chats`. Se vazio/ausente, bloqueia tudo.
- Identificação: `Telegram (@username)` ou `Telegram` se sem username. Sufixos: `[botão]` para escolha, `[undo]` para desfazer.
- Bloqueia mesa "BALCÃO".
- Em ambíguo nunca chuta.
- Retry 3× em `version_conflict` via `withVersionRetry`.
- Dedupe por `update_id` em memória (TTL 5min).

**Multi-comando:** mensagem é split por `\n`, máx 10 linhas, falha de uma linha não bloqueia as outras. 1 linha = comportamento original sem cabeçalho. 2+ linhas = resposta consolidada com header `📊 N comandos processados:`.

**Batch de impressão (multi-comando):** ADD/REMOVE consecutivos para a mesma mesa são consolidados em UMA chamada `update_order_items` por mesa (1 reimpressão por mesa, não por linha). Pipeline:
1. Parse + `resolveWithContext` + `resolveProduct`/`autoPickFromCandidates` por linha.
2. Linhas com produto resolvido sem ambiguidade → balde **batchable** (agrupado por `cmd.table`).
3. Linhas VIEW/HELP/PARSE_ERROR/SET_TABLE/NEEDS_TABLE/esgotado/não-vinculado → **standalone** (texto individual no consolidado).
4. Linhas ainda ambíguas → **pending choices** (mensagens separadas com botões, fora do batch).
5. Para cada mesa batchable: `executeBatchForTable(table, ops, waiter, shouldPrint=true)` carrega itens UMA vez, aplica ADDs/REMOVEs em memória (reutiliza `applyAdd`/`applyRemove`/`computeDelta`), chama `update_order_items` UMA vez com `p_should_print=true`, `p_print_type='extra'` (se há delta>0), wrappa com `withVersionRetry`. Mesa inexistente + só REMOVEs = aviso. Mesa inexistente + ADDs = `create_order` consolidado.
6. Cada mesa batched ganha 1 botão `↩️ Desfazer (60s)` enviado em mensagem separada após o consolidado.

**Undo (60s, in-memory):**
- Após `runExecute` ou batch bem-sucedido, anexa botão `↩️ Desfazer (60s)`.
- `callback_data` single: `u|<table>|<product_id>|<qty>|<op>` (`op` = ação original, `a` ou `r`). Inverso é executado via `executeUndoOps` (`a`→REMOVE, `r`→ADD), `shouldPrint=false` (cozinha não reimprime).
- `callback_data` batch: `ub|<token>` onde `token` é chave em `Map pendingUndos<token, {chatId, table, ops, ts}>` (TTL 60s, cleanup preguiçoso). Token criado por `registerBatchUndo` após `executeBatchForTable.ok`.
- Botões inline de escolha (a|/r|) também ganham mensagem separada `↩️ Quer desfazer essa ação?` após sucesso.
- `consumedUndos` Map evita undo duplo (TTL 60s). Token expirado → `editMessageText: ⏱ Desfazer expirado.`.
- `editMessageText` substitui mensagem original por `↩️ Operação desfeita.\n<resultado>`. Em batch, undo reverte TODAS as ops da mesa naquela mensagem em uma única update.

**Fuzzy match (Levenshtein ≤2):**
- Helper `levenshtein(a,b)` puro JS (matriz O(n·m)).
- Em `resolveProduct`, no ramo "matches.length === 0" do fallback `products`, antes de cair em inventory_items: para cada token significativo (>3 letras, sem dígito) calcula distância contra cada token do nome de cada produto (>2 letras), filtra produtos com hit ≤2.
- 1 candidato → `found` com flag `fuzzyFrom: text`. Resposta marca `(interpretado de "bovin")`.
- 2–5 candidatos → `ambiguous` (botões).
- 0 → continua para inventory_items / `not_found`.
- Não roda fuzzy em tokens ≤3 letras nem com dígitos. Determinístico: só auto-aplica com candidato único.

**Rate limit (best-effort, in-memory):**
- `Map<chatId, number[]>` com timestamps (TTL 60s, cleanup quando `size > 200`).
- Limite 10 mensagens/60s por chat. Se exceder, responde `⚠️ Muitas ações seguidas. Aguarde alguns segundos.` (com cooldown de 10s no warning via `rateWarned` Map para não spammar).
- Aplicado APÓS whitelist e ANTES de parse, no fluxo de mensagens.
- Callbacks (botões inline) NÃO passam pelo rate limit — usuário pode confirmar/desfazer sempre.
- Atenção: in-memory, pode falhar em cold start ou múltiplas instâncias da edge function.

**Auto-pick determinístico:** antes de devolver `ambiguous`/`is_group_trigger`, `autoPickFromCandidates` ranqueia candidatos por tokens do texto: tamanho (350/600/1l/2l/473/269) ±10, modificadores (zero/diet/light/lata/longneck/gelada) ±5, palavras livres ≥3 letras +1. Se usuário NÃO mencionou zero/diet/light, candidato com esses modificadores é penalizado (−5). Vencedor só se score>0 E folga ≥5 sobre 2º.

**Botões inline (callback_query):** quando ambíguo persiste após auto-pick, `inline_keyboard` (1 botão por candidato, máx 8, +Cancelar). Texto: `Nx Nome — R$ X,XX`. `callback_data` formato compacto:
- `a|<table>|<product_uuid>|<qty>` (ADD)
- `r|<table>|<product_uuid>|<qty>` (REMOVE)
- `x` (cancelar)
- `u|<table>|<product_uuid>|<qty>|<op>` (undo single)
- `ub|<token>` (undo batch)

Webhook trata `update.callback_query`: valida UUID/qty (1–99), busca product por id, chama `executeAdd`/`executeRemove` com waiter `Telegram (@user) [botão]`, chama `answerCallbackQuery` + `editMessageText` (substitui botões pelo resultado). Dedupe de callback_id (TTL 5min). Em multi-comando, ambíguos viram mensagens separadas.

**Status de impressão:** após cada ADD/REMOVE bem-sucedido (single, batch ou callback), `formatPrintStatus(table)` lê `orders.print_status` e `print_last_error`:
- `pending`/`printing` → `🖨️ enviado para impressão`
- `printed` → `🖨️ impresso`
- `failed` → `❌ falha na impressão (<print_last_error>)`
- outro → `⚠️ status: <ps>`

**Aliases de inventory_items:**
- Populados manualmente em `inventory_items.aliases` (TEXT[]).
- **Aliases curtos ambíguos NÃO entram** — ex: "coca" sozinho não é alias de nenhuma variante (350/600/2L), força fuzzy a perguntar variante.

**Modo turbo (contexto da última mesa):** persistido em `settings` (`key = telegram_last_table:<chatId>` ou em **grupos** `key = telegram_last_table:<chatId>:<userId>` para evitar conflito entre garçons), payload JSON `{ table, ts }`, TTL 15min. `getLastTable(chatId, userId?, chatType?)` e `setLastTable(chatId, table, userId?, chatType?)` recebem `chatType` (`private`/`group`/`supergroup`/`channel`); `lastTableSettingsKey` muda chave se `isGroupChat(chatType) && userId definido`.

`setLastTable` roda só em sucesso real: ADD quando resposta começa com `✅ Mesa`, REMOVE quando começa com `➖ Mesa` ou `⚠️ Removidos`, VIEW quando a resposta não é `⚠️ Mesa N não tem pedido aberto.`, SET_TABLE sempre. `resolveWithContext` é async e usa `chatType`+`userId`. Preview também usa `getLastTable` mas nunca grava (passagem sem userId no preview, então em grupo lê chave compartilhada — aceitável já que é dry-run).

Respostas com contexto seguem com prefixo `📍 (mesa N, contexto)`.

**Modo preview (dry-run):** se a 1ª linha começa com `preview` (case-insensitive), bot remove o token, passa cada linha por `previewCommand` e responde como interpretaria SEM mutações. Resolve produto (não_found/ambiguous/found) mas NÃO chama executeAdd/Remove/View. Header `🔍 Preview de N comandos (nada foi executado):`. Preview NUNCA emite botões inline.

**Para liberar um chat:** inserir/atualizar `settings` com `key='telegram_allowed_chats'` e `value='[123456789]'`.
