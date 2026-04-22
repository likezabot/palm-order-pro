` (this is research, not a build task).

# Relatório técnico-operacional — Telegram bot (espetaria)

## 1. Fluxo completo (request → resposta)

1. **Webhook recebido** em `Deno.serve` da edge function `telegram-webhook`.
2. **Dedupe**: `isDuplicate(update_id)` em `Map` in-memory (TTL 5min). Bloqueia retries do Telegram.
3. **Roteamento**:
   - `update.callback_query` → `handleCallbackQuery` (clique de botão inline).
   - `update.message.text` → fluxo de texto.
4. **Whitelist**: `getAllowedChats()` lê `settings.telegram_allowed_chats`. Se chat_id ausente → ignora silenciosamente.
5. **Split multi-comando**: mensagem dividida por `\n`, máx 10 linhas. 1ª linha pode ter prefixo `preview` → modo dry-run.
6. **Por linha**:
   - `parseCommand(raw)` → tenta nessa ordem: HELP → VIEW canônico → VIEW natural → ADD/REMOVE formas f1/f2/f3 → fallback NOMESA (ADD/REMOVE/VIEW sem mesa) → `PARSE_ERROR`.
   - `resolveWithContext(cmd, chatId)` → se `*_NOMESA`, lê `settings.telegram_last_table:<chatId>` (TTL 15min). Vira ADD/REMOVE/VIEW normal com `fromContext=true`, ou `NEEDS_TABLE`.
   - `handleCommand` (ou `previewCommand`):
     - `resolveProduct(text)` → `singularize` → RPC `find_inventory_item_by_text` (slug/aliases) → fallback `products` por `ILIKE`/includes → fallback `inventory_items` por nome. Resultados: `found` / `ambiguous` / `not_found` / `is_group_trigger` / `out_of_stock` / `no_linked_product`.
     - Se `ambiguous`/`is_group_trigger`: `autoPickFromCandidates` (heurística por tokens: tamanho ±10, modificadores ±5, palavras ≥3 letras +1; vencedor só com score>0 e folga ≥5). Se não decidir → monta `inline_keyboard` (`a|table|uuid|qty` ou `r|...`).
     - Se `found`: `executeAdd` / `executeRemove` / `executeView`. ADD/REMOVE chamam RPC `create_order` ou `update_order_items` com `expected_version`; até 3 retries em `version_conflict`.
7. **`HandlerReply` → resposta**: prefixa `📍 (mesa N, contexto)` quando `fromContext`. Em sucesso real, `setLastTable(chatId, table)` grava em `settings`.
8. **Send**: `sendMessage` (texto + opcional `reply_markup.inline_keyboard`). Em multi-comando: 1 msg consolidada `📊 N comandos processados:` + 1 msg por ambíguo (com botões).
9. **Callback de botão**: dedupe por `callback_query.id` → executa ADD/REMOVE → `answerCallbackQuery` + `editMessageText` (substitui botões pelo resultado) → `setLastTable` em sucesso.

## 2. Capacidades atuais

**Comandos canônicos** (formas f1/f2/f3):
- `mesa N + qty produto`, `mesa N - qty produto`
- `+ qty produto na mesa N`, `- qty produto da mesa N`
- `+ qty produto mesa N`

**Linguagem natural (operadores)**:
- ADD: `+`, `add`, `adiciona(r)`, `coloca(r)`, `poe`, `manda(r)`, `bota(r)`, `mais`, `soma(r)`, `inclui(r)`, `acrescenta(r)`
- REMOVE: `-`, `remove(r)`, `tira(r)`, `retira(r)`, `cancela(r)`, `menos`, `subtrai(r)`, `exclui(r)`, `desconta(r)`
- Números por extenso: `um/uma … dez`
- Plurais: `cocas→coca`, `bovinos→bovino`, `medalhoes→medalhao`, `pasteis→pastel`, `garagens→garagem`

**VIEW natural**: `mesa N ver pedido | consulta | total | pedido | resumo | extrato | conta | quanto`, `consultar mesa N`, `como está/ta/anda a mesa N`, `quanto deu a mesa N`.

**Modo turbo (contexto)**: depois de operação bem-sucedida em mesa N, por 15 min aceita `mais um boi`, `+ 1 coca 350`, `tira uma agua`, `ver pedido`, `total`, `consultar`. Persistido em `settings` (sobrevive cold start). Resposta marcada com `📍 (mesa N, contexto)`.

**Multi-comando**: até 10 linhas separadas por `\n`, sequenciais, falha por linha não bloqueia. Contexto atualizado entre linhas (linha 1 fixa mesa, linha 2 já usa).

**Preview**: prefixo `preview` na 1ª linha → dry-run sem mutações, sem botões.

**Botões inline**: até 8 botões `Nx Nome — R$ X,XX` + Cancelar. `callback_data` compacto (≤64 bytes). `editMessageText` substitui botões pelo resultado. Dedupe de callback_id.

**Auto-pick determinístico**: resolve `coca 350`, `coca zero 600` automaticamente; só pergunta quando realmente ambíguo (`coca` puro). Penaliza zero/diet/light se usuário não citou.

**Outras garantias**: dedupe `update_id` 5min, retry 3× em `version_conflict`, whitelist obrigatória, bloqueio de `BALCÃO`, identificação `Telegram (@username)`, sugestão top-3 em `not_found`.

## 3. Limitações reais

**Parser / linguagem**:
- Não entende decimais nem `1/2`, nem qty > 99.
- Português regional: `bota dois X`, `joga um Y` (joga não está em ADD_OPS), `tasca`, `traz`, `põe` (com til já normalizado funciona, mas `joga`/`traz`/`tasca` não).
- "mesa N" só com dígitos: `mesa um`, `m1`, `mesa1` (sem espaço) **não** funcionam.
- Notas no item (`+ 1 picanha bem passada`) entram no productText e podem quebrar match.
- Não suporta múltiplos itens em uma linha (`+ 1 coca e 2 agua`) — força multi-linha.
- `mais` é ambíguo: em "mesa 1 mais 1 coca" vira ADD, mas frases tipo "mais ou menos" (sem qty depois) caem em PARSE_ERROR sem mensagem específica.

**Resolução de produto**:
- Match em `products.name` é `includes` simples sem stemming/distância — typos (`bovin`, `picana`, `coxinia`) caem em `not_found`.
- Sugestão "top 3" baseada em tokens é fraca para typos de 1–2 letras.
- Aliases ambíguos curtos foram removidos por design — bom, mas exige manutenção manual em `inventory_items.aliases`.
- Auto-pick depende de tokens conhecidos (350/600/2l/zero/diet/light/lata/longneck/gelada). Variantes novas (ex: `1.5l`, `garrafa`, `chope`) não pontuam.
- `out_of_stock` só dispara se `products.active=false`; não respeita `inventory_items.current_stock`.

**Modo turbo**:
- Contexto é por **chat_id**, não por usuário. Em grupo, dois garçons compartilham a mesma "última mesa" → potencial confusão.
- 15 min é fixo; em hora de pico pode ser pouco, em hora morta pode ser muito.
- Não há comando explícito para "fixar mesa N por 1h" nem "esquecer mesa".
- Após `preview`, contexto não é gravado — correto, mas usuário pode achar que ficou ativo.

**Operacional / impressão / estoque**:
- Bot **não** decrementa estoque (consistente com PDV, mas significa que Telegram cego para `inventory_items.current_stock`).
- `update_order_items` regrava todos os itens e marca `print_status='pending'` — cada ADD/REMOVE re-imprime delta. Em multi-comando de 5 linhas → 5 reimpressões na mesma mesa (deveria batchar).
- Sem confirmação/undo: `- 5 picanha` aplica direto, sem "tem certeza".
- `version_conflict` em concorrência alta (garçom + Telegram simultâneos) tenta 3× e desiste — usuário tem que reenviar.

**Edge cases**:
- Cold start em `getLastTable` adiciona ~200–500ms a cada comando turbo (DB roundtrip por mensagem).
- Sem rate-limit por chat: garçom pode mandar 50 linhas de ruído.
- `BALCÃO` bloqueado → balcão não pode ser editado por Telegram.
- Mensagens > 4096 chars (lista grande de pedido) podem estourar limite do Telegram.

## 4. Pontos de melhoria prioritários (impacto operacional)

1. **Cache do contexto em memória + DB write assíncrono.** Hoje cada `*_NOMESA` faz SELECT em `settings`. Cachear `Map<chatId, {table, ts}>` em memória da instância e só consultar DB no miss derruba latência turbo de ~400ms para ~5ms. DB write em fire-and-forget.
2. **Batch de impressão por janela.** Em multi-comando, agregar todos ADDs/REMOVEs da mesma mesa em UMA chamada `update_order_items` em vez de N. Reduz reimpressão e race conditions.
3. **Distância de Levenshtein no fallback de produto.** Aceitar `bovin`, `picana`, `coxinia` quando `not_found` exato. Threshold 1–2 letras evita chute, ainda pede confirmação se ambíguo.
4. **Parser de múltiplos itens na mesma linha.** `+ 1 coca e 2 agua na mesa 3` → split por `e`/`,`/`+`. Garçom de espetaria normalmente fala combo.
5. **Contexto por usuário em grupos.** Quando `chat.type === 'group'`, chave virar `telegram_last_table:<chat_id>:<user_id>`. Evita garçom A sobrescrever mesa do garçom B.
6. **Comando `mesa N` sem operação para fixar contexto.** Hoje `mesa 1` sozinho → PARSE_ERROR. Deveria responder "📍 Mesa 1 fixada por 15 min" sem executar nada.
7. **Undo curto (60s) no callback.** Resposta de ADD/REMOVE incluir botão "↩️ Desfazer". Reduz erro humano sem atrapalhar fluxo.
8. **Mensagem de erro com botão de reenvio.** `not_found` com top-3 → top-3 viram botões clicáveis (já temos infra de inline keyboard).
9. **Status de impressão na resposta.** Após ADD bem-sucedido, mostrar `🖨️ enviado para impressão` ou `⚠️ impressora offline` (já existe `print_status`). Garçom hoje não sabe se pedido caiu na cozinha.
10. **Rate limit por chat (10 msgs/min).** Evita ruído acidental.
11. **TTL configurável** via `settings.telegram_context_ttl_min` — pico vs vazio.

## 5. Ideias avançadas (sem implementar)

- **Áudio (Whisper)**: download de `voice` via `getFile`, transcrição via OpenAI Whisper / Lovable AI, passa pelo mesmo parser. "Mesa 3 mais duas coca e um bovino" → 1 toque.
- **Resumo de turno por garçom**: comando `meu turno` → soma vendas do `Telegram (@user)` no dia, top produtos, ticket médio. Direto do `order_items.waiter_name`.
- **Sugestão pró-ativa**: ao abrir mesa nova via Telegram, bot manda combo recorrente daquele horário ("Geralmente neste horário: 2 chopp + 1 picanha. Adicionar?"). Botões já prontos.
- **Status da cozinha em tempo real**: `mesa 3 cozinha` → mostra quais itens estão em `preparing` vs `done` (já temos kanban). Garçom para de ir até a cozinha perguntar.
- **Alerta automático de itens parados**: bot DM o garçom quando item está há > X min em `preparing` (Realtime + cron).
- **Comando de fechamento + envio do recibo**: `mesa 3 fechar pix 100` → chama `pay_order` + envia PDF/imagem do recibo via `sendDocument`.
- **Insights diários (cron 22h)**: top 5 produtos, mesas mais lucrativas, garçons do dia, comparado à semana passada. Direto no chat do dono.
- **Modo "comanda compartilhada"**: 1 grupo do Telegram = 1 mesa. Mensagens normais viram itens automaticamente, sem operador. Pra eventos/aniversários.
- **Reconhecimento de foto do cardápio**: cliente manda foto apontando item → Vision model identifica → bot adiciona.
- **Roteamento por NLP intent**: trocar regex por classificador leve (Lovable AI gemini-flash-lite) que retorna `{intent, table, qty, product, modifiers}`. Cobre frases livres que regex nunca pega, mantendo "sem chute" via threshold de confiança.
- **Integração com impressão**: comando `mesa 3 reimprimir` → seta `print_status='pending'` direto.
- **Auditoria por garçom**: log estruturado em tabela `telegram_audit` (quem, o quê, quando, sucesso/falha) — base para ranking, treinamento e disputa de erro.I tried calling a non-existent tool. Let me deliver the report directly as text (this is a research/analysis request, not a build task — no `<lov-plan>` needed).

# Relatório técnico-operacional — Telegram bot (espetaria)

## 1. Fluxo completo (request → resposta)

1. **Webhook** recebido em `Deno.serve` da edge `telegram-webhook`.
2. **Dedupe** por `update_id` em `Map` in-memory (TTL 5min).
3. **Roteamento**: `callback_query` → `handleCallbackQuery`; `message.text` → fluxo texto.
4. **Whitelist**: `getAllowedChats()` lê `settings.telegram_allowed_chats`. Chat fora da lista → ignora silenciosamente.
5. **Split multi-comando**: mensagem dividida por `\n`, máx 10 linhas. Prefixo `preview` na 1ª linha → dry-run.
6. **Por linha**:
   - `parseCommand`: HELP → VIEW canônico → VIEW natural → ADD/REMOVE f1/f2/f3 → fallback `*_NOMESA` → `PARSE_ERROR`.
   - `resolveWithContext`: se `*_NOMESA`, lê `settings.telegram_last_table:<chatId>` (TTL 15min). Vira ADD/REMOVE/VIEW com `fromContext=true`, ou `NEEDS_TABLE`.
   - `handleCommand`/`previewCommand`:
     - `resolveProduct`: `singularize` → RPC `find_inventory_item_by_text` (slug/aliases) → fallback `products` por includes → fallback `inventory_items` por nome. Resultados: `found`/`ambiguous`/`not_found`/`is_group_trigger`/`out_of_stock`/`no_linked_product`.
     - Ambíguo → `autoPickFromCandidates` (tamanho ±10, modificadores ±5, palavras livres +1; vencedor com score>0 e folga ≥5). Senão → `inline_keyboard` (`callback_data` compacto `a|table|uuid|qty`).
     - `executeAdd/Remove/View`: RPC `create_order` ou `update_order_items` com `expected_version`; até 3 retries em `version_conflict`.
7. **Resposta**: prefixa `📍 (mesa N, contexto)` quando `fromContext`. Em sucesso real, `setLastTable(chatId, table)` grava em `settings`.
8. **Send**: `sendMessage` (texto + opcional `inline_keyboard`). Multi-comando: 1 msg consolidada `📊 N comandos processados:` + 1 msg por ambíguo.
9. **Callback**: dedupe por `callback_query.id` → executa → `answerCallbackQuery` + `editMessageText` (substitui botões pelo resultado) → `setLastTable` em sucesso.

## 2. Capacidades atuais

**Comandos canônicos** (f1/f2/f3): `mesa N + qty produto`, `mesa N - qty produto`, `+ qty produto na/da mesa N`, `+ qty produto mesa N`.

**Operadores naturais**:
- ADD: `+`, `add`, `adiciona(r)`, `coloca(r)`, `poe`, `manda(r)`, `bota(r)`, `mais`, `soma(r)`, `inclui(r)`, `acrescenta(r)`.
- REMOVE: `-`, `remove(r)`, `tira(r)`, `retira(r)`, `cancela(r)`, `menos`, `subtrai(r)`, `exclui(r)`, `desconta(r)`.
- Números por extenso: `um/uma…dez`.
- Plurais: `cocas→coca`, `bovinos→bovino`, `medalhoes→medalhao`, `pasteis→pastel`, `garagens→garagem`.

**VIEW natural**: `mesa N ver pedido|consulta|total|pedido|resumo|extrato|conta|quanto`, `consultar mesa N`, `como está/ta/anda a mesa N`, `quanto deu a mesa N`.

**Modo turbo**: depois de operação bem-sucedida em mesa N, por 15 min aceita `mais um boi`, `+ 1 coca 350`, `tira uma agua`, `ver pedido`, `total`. Persistido em `settings` (sobrevive cold start). Marca resposta com `📍 (mesa N, contexto)`.

**Multi-comando**: até 10 linhas, sequenciais, falha por linha não bloqueia. Contexto atualizado entre linhas.

**Preview**: `preview` na 1ª linha → mostra interpretação sem mutação. Nunca emite botões.

**Botões inline**: até 8 + Cancelar. `Nx Nome — R$ X,XX`. `editMessageText` substitui botões pelo resultado. Dedupe de callback_id.

**Auto-pick**: resolve `coca 350`, `coca zero 600` automaticamente; só pergunta em `coca` puro. Penaliza zero/diet/light se não citado.

**Outras**: dedupe `update_id` 5min, retry 3× em `version_conflict`, whitelist obrigatória, bloqueio de `BALCÃO`, identificação `Telegram (@username)`, sugestão top-3 em `not_found`.

## 3. Limitações reais

**Parser / linguagem**:
- Sem decimais, frações ou qty > 99.
- Verbos regionais não cobertos: `joga`, `traz`, `tasca`.
- `mesa N` exige dígito + espaço. `mesa um`, `m1`, `mesa1` não funcionam.
- Notas no item (`+ 1 picanha bem passada`) entram no productText e quebram match.
- **Sem múltiplos itens por linha** (`+ 1 coca e 2 agua`) — força quebra de linha.
- `mesa 1 mais` (sem qty/produto) cai em PARSE_ERROR genérico.

**Resolução de produto**:
- Match em `products.name` é `includes` puro — sem stemming nem distância. Typos (`bovin`, `picana`, `coxinia`) → `not_found`.
- Sugestão top-3 baseada em tokens é fraca para typos curtos.
- Aliases exigem manutenção manual em `inventory_items.aliases`.
- Auto-pick conhece tokens fixos (350/600/2l/zero/diet/light/lata/longneck/gelada). Variantes novas (`1.5l`, `garrafa`, `chope`) não pontuam.
- `out_of_stock` só dispara via `products.active=false`; ignora `inventory_items.current_stock`.

**Modo turbo**:
- Contexto por **chat_id**, não por usuário → em grupo, dois garçons compartilham/sobrescrevem mesa.
- TTL 15min fixo, sem ajuste por horário.
- Sem comando para fixar/esquecer mesa explicitamente.
- Cada `*_NOMESA` faz roundtrip ao DB (~200–500ms latência extra).

**Operacional**:
- Bot **não decrementa estoque** (consistente com PDV, mas cego ao stock real).
- `update_order_items` regrava itens e marca `print_status='pending'` em **cada** ADD/REMOVE → 5 linhas multi-comando = 5 reimpressões na mesma mesa.
- Sem confirmação/undo: `- 5 picanha` aplica direto.
- `version_conflict`: 3 tentativas e desiste — usuário reenvia.
- Sem rate-limit por chat.
- Resposta de pedido grande pode passar de 4096 chars (limite Telegram).
- `BALCÃO` bloqueado de edição via Telegram.

## 4. Pontos de melhoria prioritários

1. **Cache do contexto em memória** com fallback DB. Latência turbo de ~400ms → ~5ms. DB write em fire-and-forget.
2. **Batch de impressão por janela em multi-comando**. Agregar todos ADDs/REMOVEs da mesma mesa em UMA chamada `update_order_items`. Reduz reimpressões e race conditions.
3. **Distância de Levenshtein no fallback de produto** (threshold 1–2 letras). Resolve `bovin`, `picana`, `coxinia` ainda sem chute.
4. **Múltiplos itens por linha**: split por `e`/`,`/`+`. Garçom raramente pede 1 item só.
5. **Contexto por usuário em grupos**: chave `telegram_last_table:<chat_id>:<user_id>` quando `chat.type === 'group'`.
6. **Comando `mesa N` sozinho fixa contexto** sem executar (hoje vira PARSE_ERROR).
7. **Botão "↩️ Desfazer" (60s)** após cada ADD/REMOVE bem-sucedido.
8. **Top-3 do `not_found` viram botões clicáveis** (infra de inline keyboard já pronta).
9. **Status de impressão na resposta**: `🖨️ enviado` ou `⚠️ impressora offline` lendo `print_status`. Garçom hoje não sabe se caiu na cozinha.
10. **Rate limit por chat** (~10 msgs/min) contra ruído acidental.
11. **TTL de contexto configurável** via `settings.telegram_context_ttl_min`.

## 5. Ideias avançadas (sem implementar)

- **Comando por áudio**: download de `voice` via `getFile` → Whisper / Lovable AI → mesmo parser. "Mesa 3 mais duas coca e um bovino" em 1 toque.
- **Resumo de turno**: `meu turno` → vendas do `Telegram (@user)` no dia, top produtos, ticket médio.
- **Sugestão pró-ativa**: ao abrir mesa nova, bot oferece combo recorrente daquele horário com botões.
- **Status da cozinha em tempo real**: `mesa 3 cozinha` → itens em `preparing` vs `done`. Elimina ida do garçom à cozinha.
- **Alerta de itens parados**: DM ao garçom quando item está há > X min em `preparing`.
- **Fechamento + recibo**: `mesa 3 fechar pix 100` → chama `pay_order` + envia recibo via `sendDocument`.
- **Insights diários (cron 22h)**: top produtos, mesas mais lucrativas, garçons do dia, comparativo semana anterior — DM ao dono.
- **Modo comanda compartilhada**: 1 grupo Telegram = 1 mesa. Eventos/aniversários.
- **Foto do cardápio**: cliente manda foto → Vision model identifica → bot adiciona.
- **Roteamento por NLP intent** (Lovable AI gemini-flash-lite) com threshold de confiança — cobre frases livres mantendo "sem chute".
- **`mesa 3 reimprimir`** → reseta `print_status='pending'`.
- **Auditoria por garçom** (`telegram_audit`): base para ranking, treinamento, disputa de erro.The user asked for a research/analysis report, no code changes. I'll deliver the report directly as the response.

# Relatório técnico-operacional — Telegram bot (espetaria)

## 1. Fluxo completo (request → resposta)

1. **Webhook** recebido em `Deno.serve` da edge `telegram-webhook`.
2. **Dedupe** por `update_id` em `Map` in-memory (TTL 5min).
3. **Roteamento**: `callback_query` → `handleCallbackQuery`; `message.text` → fluxo texto.
4. **Whitelist**: `getAllowedChats()` lê `settings.telegram_allowed_chats`. Chat fora da lista → ignora silenciosamente.
5. **Split multi-comando**: mensagem dividida por `\n`, máx 10 linhas. Prefixo `preview` na 1ª linha → dry-run.
6. **Por linha**:
   - `parseCommand`: HELP → VIEW canônico → VIEW natural → ADD/REMOVE f1/f2/f3 → fallback `*_NOMESA` → `PARSE_ERROR`.
   - `resolveWithContext`: se `*_NOMESA`, lê `settings.telegram_last_table:<chatId>` (TTL 15min). Vira ADD/REMOVE/VIEW com `fromContext=true`, ou `NEEDS_TABLE`.
   - `handleCommand`/`previewCommand`:
     - `resolveProduct`: `singularize` → RPC `find_inventory_item_by_text` (slug/aliases) → fallback `products` por includes → fallback `inventory_items` por nome. Resultados: `found`/`ambiguous`/`not_found`/`is_group_trigger`/`out_of_stock`/`no_linked_product`.
     - Ambíguo → `autoPickFromCandidates` (tamanho ±10, modificadores ±5, palavras livres +1; vencedor com score>0 e folga ≥5). Senão → `inline_keyboard` (`callback_data` compacto `a|table|uuid|qty`).
     - `executeAdd/Remove/View`: RPC `create_order` ou `update_order_items` com `expected_version`; até 3 retries em `version_conflict`.
7. **Resposta**: prefixa `📍 (mesa N, contexto)` quando `fromContext`. Em sucesso real, `setLastTable(chatId, table)` grava em `settings`.
8. **Send**: `sendMessage` (texto + opcional `inline_keyboard`). Multi-comando: 1 msg consolidada `📊 N comandos processados:` + 1 msg por ambíguo.
9. **Callback**: dedupe por `callback_query.id` → executa → `answerCallbackQuery` + `editMessageText` (substitui botões pelo resultado) → `setLastTable` em sucesso.

## 2. Capacidades atuais

**Comandos canônicos** (f1/f2/f3): `mesa N + qty produto`, `mesa N - qty produto`, `+ qty produto na/da mesa N`, `+ qty produto mesa N`.

**Operadores naturais**:
- ADD: `+`, `add`, `adiciona(r)`, `coloca(r)`, `poe`, `manda(r)`, `bota(r)`, `mais`, `soma(r)`, `inclui(r)`, `acrescenta(r)`.
- REMOVE: `-`, `remove(r)`, `tira(r)`, `retira(r)`, `cancela(r)`, `menos`, `subtrai(r)`, `exclui(r)`, `desconta(r)`.
- Números por extenso: `um/uma…dez`.
- Plurais: `cocas→coca`, `bovinos→bovino`, `medalhoes→medalhao`, `pasteis→pastel`, `garagens→garagem`.

**VIEW natural**: `mesa N ver pedido|consulta|total|pedido|resumo|extrato|conta|quanto`, `consultar mesa N`, `como está/ta/anda a mesa N`, `quanto deu a mesa N`.

**Modo turbo**: depois de operação bem-sucedida em mesa N, por 15 min aceita `mais um boi`, `+ 1 coca 350`, `tira uma agua`, `ver pedido`, `total`. Persistido em `settings` (sobrevive cold start). Marca resposta com `📍 (mesa N, contexto)`.

**Multi-comando**: até 10 linhas, sequenciais, falha por linha não bloqueia. Contexto atualizado entre linhas.

**Preview**: `preview` na 1ª linha → mostra interpretação sem mutação. Nunca emite botões.

**Botões inline**: até 8 + Cancelar. `Nx Nome — R$ X,XX`. `editMessageText` substitui botões pelo resultado. Dedupe de callback_id.

**Auto-pick**: resolve `coca 350`, `coca zero 600` automaticamente; só pergunta em `coca` puro. Penaliza zero/diet/light se não citado.

**Outras**: dedupe `update_id` 5min, retry 3× em `version_conflict`, whitelist obrigatória, bloqueio de `BALCÃO`, identificação `Telegram (@username)`, sugestão top-3 em `not_found`.

## 3. Limitações reais

**Parser / linguagem**:
- Sem decimais, frações ou qty > 99.
- Verbos regionais não cobertos: `joga`, `traz`, `tasca`.
- `mesa N` exige dígito + espaço. `mesa um`, `m1`, `mesa1` não funcionam.
- Notas no item (`+ 1 picanha bem passada`) entram no `productText` e quebram o match.
- **Sem múltiplos itens por linha** (`+ 1 coca e 2 agua`) — força quebra de linha.
- `mesa 1 mais` (sem qty/produto) cai em PARSE_ERROR genérico.

**Resolução de produto**:
- Match em `products.name` é `includes` puro — sem stemming nem distância. Typos (`bovin`, `picana`, `coxinia`) → `not_found`.
- Sugestão top-3 baseada em tokens é fraca para typos curtos.
- Aliases exigem manutenção manual em `inventory_items.aliases`.
- Auto-pick conhece tokens fixos (350/600/2l/zero/diet/light/lata/longneck/gelada). Variantes novas (`1.5l`, `garrafa`, `chope`) não pontuam.
- `out_of_stock` só dispara via `products.active=false`; ignora `inventory_items.current_stock`.

**Modo turbo**:
- Contexto por **chat_id**, não por usuário → em grupo, dois garçons compartilham/sobrescrevem mesa.
- TTL 15min fixo, sem ajuste por horário.
- Sem comando para fixar/esquecer mesa explicitamente.
- Cada `*_NOMESA` faz roundtrip ao DB (~200–500ms latência extra).

**Operacional**:
- Bot **não decrementa estoque** (consistente com PDV, mas cego ao stock real).
- `update_order_items` regrava itens e marca `print_status='pending'` em **cada** ADD/REMOVE → 5 linhas multi-comando na mesma mesa = 5 reimpressões.
- Sem confirmação/undo: `- 5 picanha` aplica direto.
- `version_conflict`: 3 tentativas e desiste — usuário reenvia.
- Sem rate-limit por chat.
- Resposta de pedido grande pode passar de 4096 chars (limite Telegram).
- `BALCÃO` bloqueado de edição via Telegram.

## 4. Pontos de melhoria prioritários

1. **Cache do contexto em memória** com fallback DB. Latência turbo de ~400ms → ~5ms. DB write em fire-and-forget.
2. **Batch de impressão por janela em multi-comando**. Agregar todos ADDs/REMOVEs da mesma mesa em UMA chamada `update_order_items`. Reduz reimpressões e race conditions.
3. **Distância de Levenshtein no fallback de produto** (threshold 1–2 letras). Resolve `bovin`, `picana`, `coxinia` ainda sem chute.
4. **Múltiplos itens por linha**: split por `e`/`,`/`+`. Garçom raramente pede 1 item só.
5. **Contexto por usuário em grupos**: chave `telegram_last_table:<chat_id>:<user_id>` quando `chat.type === 'group'`.
6. **Comando `mesa N` sozinho fixa contexto** sem executar (hoje vira PARSE_ERROR).
7. **Botão "↩️ Desfazer" (60s)** após cada ADD/REMOVE bem-sucedido.
8. **Top-3 do `not_found` viram botões clicáveis** (infra de inline keyboard já pronta).
9. **Status de impressão na resposta**: `🖨️ enviado` ou `⚠️ impressora offline` lendo `print_status`. Garçom hoje não sabe se caiu na cozinha.
10. **Rate limit por chat** (~10 msgs/min) contra ruído acidental.
11. **TTL de contexto configurável** via `settings.telegram_context_ttl_min`.

## 5. Ideias avançadas (sem implementar)

- **Comando por áudio**: download de `voice` via `getFile` → Whisper/Lovable AI → mesmo parser. "Mesa 3 mais duas coca e um bovino" em 1 toque.
- **Resumo de turno**: `meu turno` → vendas do `Telegram (@user)` no dia, top produtos, ticket médio.
- **Sugestão pró-ativa**: ao abrir mesa nova, bot oferece combo recorrente daquele horário com botões.
- **Status da cozinha em tempo real**: `mesa 3 cozinha` → itens em `preparing` vs `done`. Elimina ida do garçom à cozinha.
- **Alerta de itens parados**: DM ao garçom quando item está há > X min em `preparing`.
- **Fechamento + recibo**: `mesa 3 fechar pix 100` → chama `pay_order` + envia recibo via `sendDocument`.
- **Insights diários (cron 22h)**: top produtos, mesas mais lucrativas, garçons do dia, comparativo semana anterior — DM ao dono.
- **Modo comanda compartilhada**: 1 grupo Telegram = 1 mesa. Eventos/aniversários.
- **Foto do cardápio**: cliente manda foto → vision model identifica → bot adiciona.
- **Roteamento por NLP intent** (Lovable AI `gemini-flash-lite`) com threshold de confiança — cobre frases livres mantendo "sem chute".
- **`mesa 3 reimprimir`** → reseta `print_status='pending'`.
- **Auditoria por garçom** (`telegram_audit`): base para ranking, treinamento e disputa de erro.<lov-code></lov-code>
