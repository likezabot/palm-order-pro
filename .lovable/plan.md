

## Pacote completo de melhorias — Telegram bot

Arquivo único: `supabase/functions/telegram-webhook/index.ts`. Sem mudanças de banco, RLS, RPCs, parser canônico, dedupe, whitelist, preview, multi-comando, auto-pick.

### 1. Batch de impressão (multi-comando)

No bloco `lines.length > 1` do `Deno.serve`:

- 1ª passada: parse + `resolveWithContext` por linha. Separa em 3 baldes:
  - **batchable**: `ADD`/`REMOVE` resolvidos, com mesa válida e produto resolvido sem ambiguidade (incluindo auto-pick).
  - **standalone**: `VIEW`, `HELP`, `PARSE_ERROR`, `NEEDS_TABLE`, esgotado, sem produto vinculado, erro inesperado → executa como hoje, 1 resposta por linha.
  - **pending choices**: ambíguos → continuam como hoje (botões em mensagens separadas, fora do batch).
- Resolve produto antes do agrupamento (chama `resolveProduct`/`autoPickFromCandidates`); se não precisa de botão, vai para batchable.
- Agrupa batchable por `cmd.table`. Para cada mesa:
  - Carrega `order` + `order_items` UMA vez.
  - Se mesa não existe e há ADDs: cria pedido com itens já agregados (1 `create_order`).
  - Se mesa existe: aplica todos os ADDs/REMOVEs em memória, computa `delta` final, chama `update_order_items` UMA vez com `p_should_print=true`, `p_print_type='extra'`. Itens removidos não entram no delta (já hoje só ADD positivo entra).
  - Atualiza contexto com a mesa (`setLastTable`) apenas após sucesso da mesa inteira.
  - Wrappa com `withVersionRetry` (3 tentativas).
- Linha não-batchable executa imediatamente, na ordem original, antes ou depois conforme posição (preserva mensagens claras "linha N").
- Resposta consolidada: `📊 N comandos processados:` + por mesa "✅ Mesa T: +2 Coca, -1 Água, +1 Bovino — Total R$ X,XX (1 impressão)" + linhas standalone individuais + ambíguos vão como mensagens com botões depois.

Status de impressão (item 6.4) lê `print_status` da mesa pós-update (`pending`/`printed`) → `🖨️ enviado` ou `⚠️ aguardando impressão`.

### 2. Botão de desfazer (60s)

- Após `executeAdd` ou `executeRemove` bem-sucedido (single-line, multi-line batch e callback), anexar 1 botão `[↩️ Desfazer]` na resposta.
- `callback_data`: `u|<table>|<product_id>|<qty>|<op>` onde `op` é `a` (foi ADD → undo remove) ou `r` (foi REMOVE → undo add). Para batch: 1 botão por mesa, `callback_data` `ub|<token>` onde `token` é chave para `Map` in-memory `pendingUndos: Map<token, { chatId, table, ops: [{op, productId, qty}], ts }>` (TTL 60s, cleanup preguiçoso).
- `handleCallbackQuery` ganha branch `data.startsWith("u|")` e `data.startsWith("ub|")`:
  - Valida TTL e dedupe (callback dedupe já existe).
  - Executa ações inversas via `executeAdd`/`executeRemove` (mantém RPC; reimprime apenas o delta inverso, conforme decisão "consolidada com tudo").
  - `editMessageText` → "↩️ Operação desfeita" (remove botão).
  - Marca token como consumido (remove do Map).
- Se TTL expirou: `editMessageText` → "⏱ Desfazer expirado".
- Compatível com mensagens com outros botões (ambíguos não recebem undo — só a resposta final pós-execução).

### 3. Fuzzy match (Levenshtein)

- Adicionar `levenshtein(a: string, b: string): number` puro JS (matriz O(n·m)).
- Em `resolveProduct`, no ramo "matches.length === 0" do fallback `products`:
  - Calcula distância de cada token significativo do input (>3 letras, sem dígitos) contra cada `products.name` normalizado (token-a-token).
  - Filtra produtos com distância ≤2 em pelo menos um token-chave do nome.
  - Se sobra **exatamente 1**: retorna `found` com flag `fuzzyMatched=true`.
  - Se sobra 2+: vira `ambiguous` (botões existentes).
  - Se sobra 0: continua para `inventory_items` fallback / `not_found`.
- Resposta marca correção: `✅ Mesa 3 → +1 Bovino (interpretado de "bovin")`.
- Não roda fuzzy em tokens ≤3 letras nem em texto vazio.

### 4. Rate limit por chat (best-effort)

⚠️ Backend não tem primitivos de rate limit; implementação é ad-hoc in-memory (pode falhar em cold start / multi-instância).

- `Map<chatId, number[]>` com timestamps das últimas mensagens (TTL 60s, cleanup preguiçoso).
- Antes de processar texto (após whitelist, antes do parse), checa se passou de 10 msgs/60s. Se sim:
  - Responde `⚠️ Muitas ações seguidas. Aguarde alguns segundos.` e retorna.
  - Não conta a própria mensagem de aviso (rate-limit do aviso usa flag separada para não spammar).
- Callbacks (botões inline) **não passam pelo rate limit** — usuário deve poder confirmar undo/escolha sempre.

### 5. Contexto por usuário em grupos

- Aceitar `chat.type` no payload (já vem em `update.message.chat.type`).
- `lastTableSettingsKey(chatId, userId?, chatType?)`: se `chatType === "group" || "supergroup"` e `userId` definido → `telegram_last_table:${chatId}:${userId}`, senão chave atual.
- Propagar `userId` (e `chatType`) por todo o fluxo: `getLastTable`/`setLastTable`/`resolveWithContext`/`previewCommand`/`handleCallbackQuery` (callback usa `cb.message.chat.type` + `cb.from.id`).
- TTL e shape do payload inalterados.

### 6. UX

**6.1 Fixar mesa manualmente**
- Em `parseCommand`, antes do `PARSE_ERROR` final: se texto matchar `^mesa\s+(\d+)$` → novo tipo `{ kind: "SET_TABLE", table }`.
- `handleCommand`: para `SET_TABLE`, retorna `{ text: "📍 Mesa N definida para os próximos comandos (15 min).", successTable: table }` — `setLastTable` é disparado pelo fluxo padrão.

**6.2 Mensagens de erro**
- `PARSE_ERROR`: já mostra exemplos. Vou refinar para detectar caso parcial (tem mesa sem operador / tem operador sem produto / tem qty sem produto) e dar exemplo direcionado, em vez do texto genérico atual. Sem inventar interpretação — só sugestão de formato.

**6.3 Botões para sugestões `not_found`**
- `suggestProducts` já retorna até 3 nomes. Mapear para botões clicáveis com `callback_data: a|<table>|<product_id>|<qty>` ou `r|...` (mesmo formato dos ambíguos). Resposta: "❓ Não achei … Talvez:" + botões.
- Buscar `id` dos sugeridos junto (refactor de `suggestProducts` para retornar `{id, name}`).
- Em comando turbo (sem mesa) sem contexto: continua sem botões (não há `table`).

**6.4 Status de impressão**
- Após `executeAdd`/`executeRemove` (e batch): re-fetch `orders.print_status` da mesa.
- Append na linha: `🖨️ enviado para impressão` (`pending`/`printing`) ou `⚠️ aguardando fila` (`printed` raro pós-update) ou `❌ falha (<print_last_error>)` se houver erro recente.

### Atualização de memória

`mem://features/telegram-bot.md` ganha seções:
- **Batch multi-comando**: agrupamento por mesa, 1 update/print por mesa, ambíguos saem do batch.
- **Undo (60s)**: tokens in-memory `pendingUndos`, callback `u|...`/`ub|...`, reimprime delta inverso, edita mensagem.
- **Fuzzy match**: Levenshtein ≤2, só auto se candidato único, marca "interpretado de".
- **Rate limit**: 10/60s in-memory por chat, não bloqueia callbacks, best-effort.
- **Contexto por usuário em grupos**: chave `:userId` quando `chat.type` é group/supergroup.
- **Comando `mesa N`**: novo `SET_TABLE`, fixa contexto sem executar.
- **Sugestões clicáveis**: not_found vira botões.
- **Status de impressão**: append `🖨️`/`⚠️` lendo `print_status`.

### Garantias

- Comandos canônicos, multi-comando, preview, contexto turbo, auto-pick, dedupe, whitelist, plurais, VIEW natural — preservados.
- Sem mudança em `supabase/migrations/*`, RPCs, RLS, índices.
- Determinístico: fuzzy só auto-aplica com 1 candidato; resto pede confirmação.
- Edge function permanece um arquivo único.

### Fora de escopo

- Persistência de undo/rate-limit em DB (sobrevive cold start).
- Múltiplos itens por linha (`+1 coca e 2 agua`).
- Decimais/frações, qty > 99.
- Audio/voice, NLP intent, kitchen status, cron de insights.
- Rate limit configurável via settings.

