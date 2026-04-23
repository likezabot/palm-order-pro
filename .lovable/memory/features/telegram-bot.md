---
name: Telegram bot
description: Bot do Telegram edita pedidos por texto OU voz (mesa N + qty produto), CONTROLA ESTOQUE via gatilhos explícitos (entrada/saida/ajuste/estoque/lista estoque) E em modo CONVERSACIONAL v2 (wizard rico). Aceita VOICE (microfone) — transcreve com Lovable AI (Gemini 2.5 Flash, áudio nativo OGG/Opus) e roda no mesmo parser de texto. Confirmação híbrida: comandos de leitura/pedido executam direto com prefixo "🎤 Ouvi: ..."; STOCK_MOVEMENT pede botão ✅ Executar / ❌ Cancelar (state em telegram_chat_state step=voice_confirm, TTL 2min, callbacks vc|ok|<token> e vc|no|<token>). Categorias do estoque alinhadas ao cardápio. Whitelist em settings.telegram_allowed_chats.
type: feature
---
Edge function `telegram-webhook` permite editar pedidos via texto:
- `mesa N + qty produto` → ADD (cria pedido se não existir, ou update_order_items com print extra)
- `mesa N - qty produto` → REMOVE (sem impressão)
- `mesa N ver pedido` → VIEW
- `mesa N` → SET_TABLE (fixa contexto sem executar; resposta `📍 Mesa N definida para os próximos comandos (15 min).`)
- `ajuda` / `/start` / `/help` → HELP

**Estoque (comandos diretos — inalterados):**
- `entrada 10 coca` / `entrou 5kg picanha` / `chegou 20 cerva` / `+ 10 coca` → STOCK_MOVEMENT type=in.
- `saida 2 coca` / `usei 1kg picanha` / `gastei 3 carvao` / `tirei 2 coca do estoque` → STOCK_MOVEMENT type=out.
- `ajuste coca 50` / `setar coca para 50` / `atualiza coca = 30` / `contei 50 coca` / `marca coca 50` / `tem 12 coca` → STOCK_MOVEMENT type=adjustment.
- `estoque coca` / `saldo coca` / `quanto tem de coca` → STOCK_QUERY.
- `estoque` (sozinho) / `criticos` / `alertas` / `o que falta` → STOCK_CRITICAL.
- `lista estoque` / `inventario` / `tudo do estoque` → STOCK_LIST.
- **`acabou X` / `acabou o X` / `terminou X` / `zerou X` / `não tem mais X` / `sem X` / `esgotou X`** → STOCK_OUT_NOW (atalho rápido sem qty). Resolve via `find_inventory_item_by_text`, força `apply_inventory_movement(adjustment, 0)`. Resposta: `✅ Marquei "<nome>" como esgotado (estoque = 0). PALM já mostra a tarja.` Executa direto na voz (sem confirmação — baixo risco, reversível com undo). Botão ↩️ Desfazer aparece.
- Aliases extras: IN aceita `repor|abasteci|entregou|subir|reposicao`; OUT aceita `vendi|quebrou|descartei|perdi|baixa`. (Removido "acabou" do OUT — agora é STOCK_OUT_NOW.)

**Wizard v2 de Estoque (REFEITO — fluxo navegável e robusto):**

Gatilhos: `gerenciar estoque`, `menu estoque`, `controle estoque`, `wizard estoque`, `gerenciar`, `contagem`, `fazer contagem`. Comandos texto durante wizard: `/menu` ou `menu` volta ao principal, `/cancelar` ou `cancelar` mata o estado, `/voltar` ou `voltar` volta uma etapa.

Fluxo:
1. **Menu principal rico** (`main_menu`): mostra contagem de itens ativos, críticos e zerados; categorias com contagem; rascunho de carrinho se houver. Botões: Entrada/Saída/Ajuste/Carrinho/Buscar/Por categoria/Críticos/Listar tudo/Fechar.
2. **Picker de item** (`awaiting_item`): após escolher Entrada/Saída/Ajuste, mostra **top 5 mais movimentados nos últimos 30 dias** (query em `inventory_movements` agrupada). Cada botão exibe nome + saldo formatado. Atalhos: Buscar, Por categoria, Todos os itens.
3. **Busca** (`awaiting_search`): texto livre faz ilike+RPC `find_inventory_item_by_text`. 1 resultado → vai pra qty. >1 → lista botões com saldo.
4. **Quantidade contextual** (`awaiting_qty`): mostra cabeçalho com saldo atual, mínimo, ação. Sugestões inteligentes (top 4 do histórico do item específico ou geral, fallback `[1,5,10,24]` ou `[0,10,50,100]` para ajuste). Para `out` com saldo ≤ 10 mostra "Tirar tudo". Para `adj` mostra "Manter (X)" e "Zerar (0)". Botão "Digitar valor" abre `awaiting_qty_text`.
5. **Texto livre de qty**: aceita `12`, `2.5`, `+24`, `-3`, `=50` (prefixo só clarifica intenção visual).
6. **Review single** (`awaiting_review`): preview "Saldo: X → Y", avisos se ficará negativo/zerado/abaixo do mín. Botões: ✅ Confirmar, ➕ Confirmar e fazer outra, 🧾 Adicionar ao carrinho, ←/🏠/❌.
7. **Resultado single**: mensagem com saldo antes/depois + botões: ↩️ Desfazer (60s, via `us|<token>` reusa `executeStockUndo`), ➕ Outra operação no item, 🏠 Menu estoque.
8. **"Fazer outra"** (`wz|repeat`): aplica o movimento e abre o picker mantendo a ação.
9. **Operação em massa** (`awaiting_mass_review`): preview top 5 com saldo antes→depois, contagem total, "Ver lista completa" mostra até 30. Confirmação obrigatória.
10. **Modo Carrinho / Contagem multi** (`cart_main`, `cart_adding_item`, `cart_adding_qty`): adiciona várias operações no rascunho (jsonb em `data.cart`), exibe lista numerada com previsão de saldos, "Aplicar todos" executa em loop, "Sair sem salvar" descarta. TTL 30min.

Navegação:
- `wzPushHistory` empilha step+data antes de transições; `wzGoBack` re-renderiza tela anterior pelo step.
- Stack limitada a 8 frames (não duplica consecutivos).
- Mensagens **editadas** via `editTelegramMessage` em vez de spam.

Tabela `telegram_chat_state` (chat_id PK, step, data jsonb, expires_at, RLS service-only). Auto-limpeza best-effort por chamada.

**Callbacks suportados (wizard v2):**
- `wz|home` — menu principal
- `wz|back` — voltar uma etapa (usa history)
- `wz|cancel` — cancelar e limpar estado
- `wz|act|<in|out|adj|list|crit>` — ação principal
- `wz|search` — abre busca por texto
- `wz|cats` — categorias (com contagem)
- `wz|catview|<cat>` — vê itens de uma categoria sem ação definida
- `wz|item|<itemId>` — selecionar item
- `wz|scope|<all|cat>[|<cat>]` — escopo de operação em massa
- `wz|qty|<n|other>` — quantidade sugerida ou abrir digitação
- `wz|confirm` — confirmar (single ou massa)
- `wz|repeat` — confirmar single e fazer outra
- `wz|massview` — ver lista completa de operação em massa
- `wz|cart|view|addnew|setact|<a>|add|apply|clear` — modo carrinho
- `us|<token>` — undo de movimento (in-memory, 60s)

**Gatilhos VIEW/parsing de pedidos:** sem mudança — mesmo comportamento.

**Regras v2 (gerais):**
- Estoque controlado por gatilhos explícitos. Pedidos (ADD/REMOVE) NÃO mexem no saldo.
- Whitelist obrigatória: `settings.telegram_allowed_chats`. Se vazio, bloqueia tudo.
- Identificação via `telegram_user_bindings` (telegram_user_id → waiter_name).
- Bloqueia mesa "BALCÃO".
- Em ambíguo nunca chuta (auto-pick só com folga ≥5).
- Retry 3× em `version_conflict`.
- Dedupe por `update_id` em memória (TTL 5min).

**Para liberar um chat:** inserir/atualizar `settings` com `key='telegram_allowed_chats'` e `value='[123456789]'`.
