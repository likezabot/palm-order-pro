

## Modo Turbo: contexto da última mesa por chat

### Mudança (arquivo único: `supabase/functions/telegram-webhook/index.ts`)

Adicionar memória curta da última mesa usada com sucesso por `chat_id` e permitir comandos sem `mesa N` quando houver contexto válido. Sem mudanças em banco, RLS, executeAdd/Remove/View, auto-pick, botões inline ou multi-comando.

### 1. Memória in-memory por chat

`Map<chatId, { table: string; ts: number }>` no escopo do módulo, TTL 15min. Helpers:

- `getLastTable(chatId)` — retorna mesa se `Date.now() - ts < 15*60_000`, senão `null` (e remove entrada).
- `setLastTable(chatId, table)` — chamado **só após sucesso** de ADD/REMOVE/VIEW (inclusive via callback de botão inline).
- Limpeza preguiçosa no acesso (igual `seenUpdates`).

Dado que edge functions podem ter múltiplas instâncias e cold starts, o contexto é "best-effort" — se expirar entre invocações, cai na regra de segurança (pede mesa explícita). Sem persistência em DB nesta etapa.

### 2. Parser: nova etapa de fallback "sem mesa"

Atualmente `parseCommand(raw)` retorna `PARSE_ERROR` se nenhuma forma casa. Vou:

a) Adicionar um novo tipo de retorno **transitório** `{ kind: "ADD_NOMESA" | "REMOVE_NOMESA"; qty; productText }` e `{ kind: "VIEW_NOMESA" }`. Esses só são produzidos pelo parser quando a linha tem operador/qty+produto OU gatilho VIEW, mas **nenhum `mesa N`**.

b) Heurísticas (rodam **depois** das formas atuais f1/f2/f3 e antes de `PARSE_ERROR`):

- **VIEW_NOMESA**: mesma lista `VIEW_TOKENS`/`VIEW_PHRASES`, sem `mesa N`, sem operador, sem `<qty> <produto>`. Cobre `ver pedido`, `consultar`, `total`, `resumo`, `ver`, `pedido`, `como esta`.
- **ADD_NOMESA / REMOVE_NOMESA**: linha começa com operador OU operador aparece como token, seguido de `[qty] <produto>`. Sem `mesa N`. Ex: `+ 1 coca 350`, `mais um boi`, `acrescenta uma coca 350`, `tira uma agua`, `- 1 agua`.
  - Reaproveita `ADD_OPS`/`REM_OPS`, `parseQty`, `extractQtyProduct`.
  - Regex tipo `^(<op>)\s+(.+)$` aplicado ao texto normalizado (que já não contém `mesa N`).

c) Comandos completos atuais permanecem intocados — são testados primeiro.

### 3. Resolução de contexto no Deno.serve

No loop por linha (single e multi), antes de chamar `handleCommand`/`previewCommand`:

```ts
const cmd = parseCommand(line);
const resolved = resolveWithContext(cmd, chatId);
```

`resolveWithContext`:
- Se `cmd.kind` for um `*_NOMESA`: busca `getLastTable(chatId)`. Se existir, devolve cmd convertido com a mesa preenchida (vira `ADD`/`REMOVE`/`VIEW` normal). Se não existir, devolve `{ kind: "NEEDS_TABLE", originalKind }` para a camada externa transformar em mensagem amigável.
- Caso contrário: passa adiante sem mexer.

Mensagem para `NEEDS_TABLE`:
> ⚠️ Não sei qual mesa usar. Envie no formato completo, ex: `mesa 1 + 1 coca 350` (ou use uma mesa nos últimos 15 min).

### 4. Atualização do contexto após sucesso

`handleCommand` retorna `HandlerReply`. Para saber se foi sucesso (e qual mesa), expando `HandlerReply` com campo opcional `successTable?: string` preenchido em:
- Sucesso de `executeAdd` / `executeRemove` (no fim de `executeAndReply`).
- Sucesso de VIEW.
- **Não** atualiza em: ambíguo (espera o clique), erros, esgotado, parse_error, version_conflict.

No callback de botão (`handleCallbackQuery`), após sucesso de `executeAdd`/`executeRemove`, chamar `setLastTable(chatId, table)` diretamente.

No `Deno.serve`, depois de cada `reply` bem-sucedido com `successTable`, chamar `setLastTable(chatId, successTable)`.

### 5. Resposta com indicação clara de contexto

Quando o comando foi resolvido via contexto (não veio com `mesa N` explícito), prefixar a resposta com tag visível:

- `📍 (mesa 1, contexto) ✅ Mesa 1 → +1 Bovino`
- `📍 (mesa 1, contexto) 📋 Mesa 1: ...`

Implementação: `resolveWithContext` marca `cmd.fromContext = true`. `handleCommand` propaga até o texto de resposta acrescentando o prefixo `📍 (mesa N, contexto) `. Comandos com mesa explícita não recebem prefixo (comportamento atual preservado).

### 6. Preview

`previewCommand` também respeita contexto: se receber `*_NOMESA` e houver mesa em contexto, mostra `🔍 (preview, mesa 1 do contexto) Adicionaria ...`. Sem contexto: `⚠️ Nenhuma mesa em contexto. Envie mesa explícita.` Preview **nunca** atualiza `lastTable`.

### 7. Multi-comando

- Cada linha é resolvida sequencialmente. Se a linha 1 (`mesa 3 + 1 coca`) for sucesso, atualiza `lastTable=3` antes de processar linha 2 — então `mais um boi` na linha 2 já enxerga mesa 3.
- Linhas com `NEEDS_TABLE` viram entradas no resumo consolidado com o aviso, sem bloquear as outras.

### 8. Help

Adicionar seção curta no `HELP_TEXT`:
> 💨 Atalhos (15 min após usar uma mesa):
> • `mais um boi`, `+ 1 coca 350`, `tira uma agua`, `ver pedido`, `total`

### Garantias

- Comandos completos (`mesa N + qty produto`, etc.) **inalterados**.
- Auto-pick, botões inline, callbacks, dedupe de update_id e callback_id, whitelist, multi-comando, preview, plurais, parser VIEW natural — **inalterados**.
- Banco, RLS, RPCs, executeAdd/Remove/View — **inalterados**.
- Sem chute: sem contexto válido, bot pede mesa explícita.

### Atualização da memória

`mem://features/telegram-bot.md` ganha seção **Modo turbo (contexto de última mesa)**: TTL 15min, in-memory por chat, atualizado só em sucesso (incluindo botões), prefixo `📍 (mesa N, contexto)`, fallback `NEEDS_TABLE`, multi-comando atualiza contexto entre linhas, preview usa mas não grava.

### Fora de escopo

- Persistência do contexto em DB (sobrevive a cold start).
- Contexto por usuário dentro de um grupo (hoje é por `chat_id`).
- Comando explícito `usar mesa N` para fixar contexto sem operação.
- TTL configurável via `settings`.

