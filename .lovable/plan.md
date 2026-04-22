

## Estoque pelo Telegram 📦

Hoje o bot **só consulta** estoque crítico (`estoque`, `críticos`). Não dá pra registrar entrada/saída/ajuste pelo Telegram. Vou adicionar isso reaproveitando a RPC `apply_inventory_movement` (mesma usada pelo PDV/Stock).

### 1. Comandos novos

| Comando | Ação | RPC |
|---|---|---|
| `entrada 10 coca` / `entrou 5kg picanha` / `+10 coca estoque` | Soma ao estoque | `apply_inventory_movement(type='in')` |
| `saida 2 coca` / `saiu 1kg picanha` / `gastei 3 carvão` | Subtrai do estoque | `apply_inventory_movement(type='out')` |
| `ajuste coca 50` / `setar coca 50` / `tem 12 coca` | Define valor absoluto | `apply_inventory_movement(type='adjustment')` |
| `estoque coca` / `quanto tem de coca` | Mostra saldo atual de UM item | SELECT em `inventory_items` |
| `estoque` / `críticos` (já existe) | Lista críticos | já implementado |

**Diferenciador-chave:** comandos de estoque exigem palavra-gatilho explícita (`entrada`, `saida`, `ajuste`, `estoque <nome>`) — nunca confundem com `mesa N + qty produto`. Sem `mesa`, sem ADD para pedido.

### 2. Parser

Novo `Command` kind: `STOCK_MOVEMENT { type: 'in'|'out'|'adjustment', qty, itemText, unit? }` e `STOCK_QUERY { itemText }`.

Regex no `parseCommand` ANTES do bloco ADD/REMOVE:
- `^(?:entrada|entrou|recebi|chegou|comprei|\+(?=\d))\s+(?:(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|un)?\s+)?(.+)$` → IN
- `^(?:saida|saída|saiu|usei|gastei|tirei|consumi|-(?=\d))\s+(?:(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|un)?\s+)?(.+)$` → OUT
- `^(?:ajuste|ajustar|setar|set|tem|fica(?:r)?\s+com|atualiza(?:r)?)\s+(.+?)\s+(?:para\s+|=\s*|com\s+)?(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|un)?$` → ADJUSTMENT
- `^(?:estoque|saldo|quanto\s+tem(?:\s+de)?)\s+(.+)$` → QUERY (se não bater no STOCK_CRITICAL existente)

Suporta números por extenso via `parseQtyToken` (`um`, `dois`, …, `vinte`).

### 3. Resolução do item de estoque

Função nova `resolveStockItem(text)`:
1. Tenta `find_inventory_item_by_text` (slug/aliases exato — RPC já existe).
2. Fallback: `select` em `inventory_items where is_active=true` + `normalize+singularize` + match por inclusão de tokens.
3. Aplica fuzzy Levenshtein ≤2 (mesma função já usada para produtos).
4. 0 hits → `not_found_stock` (sugere `inventario` para listar). 1 hit → executa. 2+ hits → **inline buttons** com candidatos (callback `s|<type>|<item_id>|<qty>` para in/out/adj).

### 4. Execução

`executeStockMovement(itemId, type, qty, source='telegram', note='Telegram @username')`:
- Chama `sb.rpc('apply_inventory_movement', { p_item_id, p_type, p_quantity, p_note, p_source: 'telegram' })`.
- Retorno mostra: `✅ Entrada: 10 un de Coca 350ml. Saldo: 32 un.` Para OUT, se `new_stock <= min_stock`: anexa `⚠️ Atingiu o crítico (mín X)`. Se `new_stock <= 0`: `🚨 Item zerado`.
- Trigger `queue_stock_alert` / `queue_stock_in` já dispara notificação no grupo automaticamente — sem mudança aí.

### 5. Permissões e segurança

- Mesma whitelist `telegram_allowed_chats`.
- Exige garçom vinculado (mesma regra dos pedidos). Nome do garçom vai pra `note` do movimento (`Estoque via Telegram (Jacir)`).
- **Rate limit:** já existe (10/60s por chat) — vale para esses comandos também.
- **Undo:** botão `↩️ Desfazer (60s)` após cada movimento. Undo cria movimento inverso (IN↔OUT; ajuste guarda valor anterior em `pendingUndos` e aplica novo `adjustment` com valor antigo). Token `us|<token>` (stock undo).

### 6. Help atualizado

Adiciona seção no `/help`:
```
📦 ESTOQUE
• entrada 10 coca → soma ao saldo
• saida 2 picanha → subtrai
• ajuste coca 50 → define valor
• estoque coca → mostra saldo
• estoque (críticos) → lista alertas
```

### 7. Memória

Atualizar `mem://features/telegram-bot.md`:
- Substituir "NÃO mexe em estoque" por "Mexe em estoque via comandos explícitos (`entrada`, `saida`, `ajuste`, `estoque <nome>`); pedidos continuam sem afetar saldo".
- Documentar novos kinds, callbacks `s|*` e `us|*`.

### 8. Arquivos modificados

- `supabase/functions/telegram-webhook/index.ts` — parser, resolver, executor, help, callbacks de undo de estoque.
- `.lovable/memory/features/telegram-bot.md` — atualizar regras.

Sem migrations novas (RPC e triggers de notificação já existem).

### Validação

1. `entrada 10 coca` → saldo +10, notificação `📦 Entrada de estoque` cai no grupo de notificações.
2. `saida 5 coca` quando saldo fica ≤ min → alerta `⚠️ Estoque crítico` automático.
3. `ajuste coca 100` → saldo vira 100 exato.
4. `estoque coca` → responde saldo atual sem mover nada.
5. `entrada 10 xyz` (item inexistente) → mensagem amigável + dica.
6. Item ambíguo (`entrada 5 coca`) → botões com Coca 350/600/2L.
7. Undo após `entrada 10 coca` → registra OUT 10, saldo volta.

