---
name: Telegram bot
description: Bot do Telegram edita pedidos por texto (mesa N + qty produto), CONTROLA ESTOQUE via gatilhos explícitos (entrada/saida/ajuste/estoque/lista estoque) e suporta múltiplos comandos numa só mensagem (separadores \n, ;, |, //). Whitelist em settings.telegram_allowed_chats. Suporta batch consolidado, undo 60s, fuzzy match, contexto por usuário em grupos, SET_TABLE, sugestões clicáveis, status de impressão e amplos aliases naturais.
type: feature
---
Edge function `telegram-webhook` permite editar pedidos via texto:
- `mesa N + qty produto` → ADD (cria pedido se não existir, ou update_order_items com print extra)
- `mesa N - qty produto` → REMOVE (sem impressão)
- `mesa N ver pedido` → VIEW (também aceita variações naturais — ver abaixo)
- `mesa N` → SET_TABLE (fixa contexto sem executar; resposta `📍 Mesa N definida para os próximos comandos (15 min).`)
- `ajuda` / `/start` / `/help` → HELP

**Estoque (NOVO):**
- `entrada 10 coca` / `entrou 5kg picanha` / `chegou 20 cerva` / `+ 10 coca` → STOCK_MOVEMENT type=in (chama RPC `apply_inventory_movement`).
- `saida 2 coca` / `usei 1kg picanha` / `gastei 3 carvao` / `tirei 2 coca do estoque` → STOCK_MOVEMENT type=out.
- `ajuste coca 50` / `setar coca para 50` / `atualiza coca = 30` / `contei 50 coca` / `marca coca 50` / `tem 12 coca` → STOCK_MOVEMENT type=adjustment.
- `estoque coca` / `saldo coca` / `quanto tem de coca` / `quanta coca tem` / `qtd coca` / `tem coca?` → STOCK_QUERY (saldo de UM item).
- `estoque` (sozinho) / `criticos` / `alertas` / `o que falta` / `precisa repor` → STOCK_CRITICAL.
- `lista estoque` / `inventario` / `tudo do estoque` / `todos itens` / `estoque completo` → STOCK_LIST (NOVO; até 30 itens ativos com saldo, ordem alfabética).
- Aliases extras pra movimentos: IN aceita `repor|abasteci|entregou|subir|reposicao`; OUT aceita `vendi|acabou|quebrou|descartei|perdi|baixa`.

**Múltiplos comandos numa mensagem (NOVO):**
- Separadores aceitos pelo `splitCommands(text)`: quebra de linha, `;`, ` | ` (com espaços), ` // ` (com espaços).
- Auto-split por `mesa N` repetida na mesma linha (só se TODAS as partes contêm operador/ação reconhecível). Conservador: produtos com "mesa" no nome não quebram.
- Limite de 10 comandos por mensagem mantido. Consolidação ADD/REMOVE da mesma mesa numa só impressão mantida.
- Gatilhos são EXPLÍCITOS para nunca confundir com pedidos. Em particular: `-N produto` SEM mesa continua sendo REMOVE_NOMESA (pedido), não saída de estoque.
- Resolver `resolveStockItem(text)`: 1) RPC `find_inventory_item_by_text` (slug/aliases exato); 2) match por inclusão de tokens em `inventory_items where is_active=true`; 3) fuzzy Levenshtein ≤2 nos tokens significativos. 0 hits → not_found. 1 → executa. 2–8 → ambíguo com botões.
- Botões inline ambíguos: `callback_data` `s|<in|out|adj>|<itemId>|<qty>` (até 8 candidatos + Cancelar).
- Undo de estoque (60s, in-memory): após cada movimento, botão `↩️ Desfazer (60s)` com `callback_data` `us|<token>`. `pendingStockUndos<token, {itemId, type, qty, previousStock, ts}>`. IN→OUT, OUT→IN, ADJUSTMENT→novo ADJUSTMENT com `previousStock`.
- Note do movimento: `Telegram (<waiter_name>)`. Source: `telegram`.
- Triggers `queue_stock_in` e `queue_stock_alert` continuam disparando notificações automáticas no grupo configurado — sem mudança lá.

**Gatilhos VIEW naturais:** parser detecta VIEW antes de ADD/REMOVE. Requer `mesa N` + 1 gatilho, SEM operador ADD/REMOVE e SEM padrão `<qty> <produto>`. Tokens: ver/ve, consulta/consultar/consulte, total/totais, pedido/pedidos, mostra/mostrar/mostre, lista/listar/liste, resumo, extrato, conta, quanto. Frases compostas (includes): "como esta", "como ta", "como anda".

Parser também aceita variações naturais para pedidos: "adiciona 1 bovino na mesa 1", "coloca 2 coca na mesa 3", "mesa 2 tira 1 agua", "mesa 1 mais um bovino", "acrescenta tres bovinos na mesa 2". Operadores ADD: +, add, adiciona(r), coloca(r), poe, manda(r), bota(r), mais, soma(r), inclui(r), acrescenta(r). Operadores REMOVE: -, remove(r), tira(r), retira(r), cancela(r), menos, subtrai(r), exclui(r), desconta(r). Aceita números por extenso 1–10.

**Plural simples:** singularize() roda antes de resolveProduct/resolveStockItem. Conservador.

**Regras v2:**
- Estoque: agora controlado por gatilhos explícitos. Pedidos (ADD/REMOVE) continuam SEM mexer no saldo (consistência com PDV).
- Whitelist obrigatória: `settings.telegram_allowed_chats`. Se vazio/ausente, bloqueia tudo.
- Identificação: vinculação `telegram_user_bindings` (telegram_user_id → waiter_name). Bot lista garçons cadastrados em `profiles` (role='waiter') com botões inline (2 colunas se >3) + 🔄 Atualizar lista. `pw|<base64url(nome)>` é resiliente a reordenação. Comandos: `/trocar`, `/quemsoueu`, `/resetar` (só DM).
- Bloqueia mesa "BALCÃO".
- Em ambíguo nunca chuta (auto-pick determinístico só com folga ≥5).
- Retry 3× em `version_conflict` via `withVersionRetry`.
- Dedupe por `update_id` em memória (TTL 5min).

**Multi-comando, batch de impressão, fuzzy, autoPick, callbacks de pedidos (a|/r|/u|/ub|/x), modo turbo (contexto), preview (dry-run):** sem mudanças — comportamento original mantido.

**Callbacks suportados:**
- `pw|<b64>` — escolher garçom
- `pw_refresh` — atualizar lista de garçons
- `a|<table>|<product_id>|<qty>` — confirmar ADD em pedido
- `r|<table>|<product_id>|<qty>` — confirmar REMOVE em pedido
- `u|<table>|<product_id>|<qty>|<op>` — undo single de pedido
- `ub|<token>` — undo batch de pedido
- `s|<in|out|adj>|<itemId>|<qty>` — confirmar movimento de estoque (NOVO)
- `us|<token>` — undo de movimento de estoque (NOVO)
- `x` — cancelar

**Para liberar um chat:** inserir/atualizar `settings` com `key='telegram_allowed_chats'` e `value='[123456789]'`.
