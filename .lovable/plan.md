

# Wizard de Estoque v2 — Fluxo robusto e navegável

Refazer o wizard do Telegram com **navegação livre, contexto rico e operações encadeadas**. Comandos diretos (`entrada 10 coca`) continuam funcionando sem mudança.

## Problemas do v1 (atual)

1. Fluxo é uma escada de mão única — não dá pra **voltar** uma etapa.
2. Botão de quantidade mostra só número (`5`), sem unidade nem item.
3. Não mostra **saldo atual** antes de mexer.
4. Categoria só lista 2 por linha sem mostrar quantos itens tem em cada.
5. Busca de item retorna até 8 botões, mas sem saldo nem categoria pra desambiguar.
6. Ajuste em massa (`ajuste 0 em todos`) só pede confirmação genérica, sem preview detalhado.
7. Acabou a operação → sumiu. Não tem "fazer outra", "ver resultado completo", "desfazer".
8. Sem **carrinho** pra fazer várias entradas/saídas de uma vez (ex: contagem semanal).

## Fluxo novo

### Tela 1 — Menu principal (rico)

```text
📦 Gerenciar Estoque
Saldo total: 47 itens ativos · 3 críticos · 1 zerado

[📥 Entrada]  [📤 Saída]
[✏️ Ajuste]  [🧾 Contagem (multi)]
[🔍 Buscar item]  [📂 Por categoria]
[🚨 Críticos (3)]  [📋 Listar tudo]
[❌ Fechar]
```

- "Contagem multi" abre modo carrinho (novo).
- Categorias agora mostradas com contagem: `📂 bebidas (12)`.

### Tela 2 — Seleção de item (com contexto)

Quando escolhe ação OU "Buscar item", entra numa tela com:

```text
📥 Entrada · Escolha o item
ou digite parte do nome

Mais usados (últimos 30 dias):
[🍺 Cerveja Heineken · 24 un]
[🥩 Picanha · 3.2 kg]
[🥤 Coca-Cola · 18 un]

[📂 Filtrar por categoria]
[← Voltar]  [❌ Cancelar]
```

- Saldo atual ao lado do nome (formatado com unidade).
- Top 5 itens mais movimentados nas últimas 30 dias (query em `inventory_movements`).
- Texto livre busca instantâneo e mostra até 8 com saldo + categoria.

### Tela 3 — Quantidade (contextual)

```text
📥 Entrada · 🍺 Cerveja Heineken
Saldo atual: 24 un · Mínimo: 12 un

Quanto adicionar?
[+1]  [+6]  [+12]  [+24]
[+1 caixa (24)]    ← se unit_pack existir
[✏️ Digitar valor]
[← Voltar]  [❌ Cancelar]
```

- Sugestões: 4 valores derivados do histórico do **item específico** (top frequencies das últimas 60 movimentações), com fallback `[1, 5, 10, 24]`.
- Para `out`, sugere também "tudo" se saldo ≤ 10.
- Para `adjustment`, mostra o saldo atual como sugestão pra correção rápida (`[Manter 24]`, `[Zerar 0]`, valores históricos).

### Tela 4 — Confirmação (sempre, com preview)

```text
✅ Revisar
🍺 Cerveja Heineken
Operação: Entrada de 24 un
Saldo: 24 → 48 un

[✅ Confirmar]
[➕ Confirmar e fazer outra]   ← novo
[← Voltar]  [❌ Cancelar]
```

- "Confirmar e fazer outra" volta pra Tela 2 mantendo a ação (entrada/saída/ajuste).
- Single sempre confirma agora (consistência) — mas com botão "Voltar" pra ajustar antes.

### Tela 5 — Resultado (acionável)

```text
✅ Pronto
🍺 Cerveja Heineken: 24 → 48 un
Movimento: Entrada · Telegram (José)

[↩️ Desfazer (60s)]
[➕ Outra operação no item]
[🏠 Menu estoque]
```

## Modo Carrinho (Contagem multi-item) — novo

Caso de uso: contagem física semanal — ajustar 20 itens duma vez.

```text
🧾 Contagem (multi)
3 itens no rascunho · ainda não aplicado

1. 🍺 Heineken: 24 → 30 un
2. 🥤 Coca: 18 → 12 un
3. 🥩 Picanha: 3.2 → 2.8 kg

[➕ Adicionar item]
[✅ Aplicar todos (3)]
[🗑 Limpar]  [❌ Sair sem salvar]
```

- Cada "Adicionar item" reabre Tela 2/3/4 mas em vez de aplicar, **empilha** no rascunho (jsonb em `telegram_chat_state.data.cart`).
- "Aplicar todos" executa em transação lógica (loop em `apply_inventory_movement`) e gera **um único token de undo** que reverte o lote inteiro (reusa `telegram_undo_stack`).
- TTL do rascunho: 30 min (não 5 min como wizard normal).

## Operações em massa (revisadas)

Quando escopo = `all` ou `category`:

```text
⚠️ Operação em massa
Entrada de +10 un em 23 itens (categoria bebidas)

Preview (top 5):
• Heineken: 24 → 34
• Coca-Cola: 18 → 28
• Skol: 12 → 22
• Brahma: 8 → 18
• Água: 5 → 15
… +18 itens

⚠️ Itens sem unidade compatível serão pulados

[✅ Aplicar em 23 itens]
[👁 Ver lista completa]
[← Voltar]  [❌ Cancelar]
```

## Navegação universal

- Todo botão `[← Voltar]` recupera o estado anterior do `data.history` (stack pequeno em jsonb).
- `❌ Cancelar` em qualquer tela → confirma se há rascunho não salvo no carrinho.
- Comando texto `/menu` ou `voltar` durante wizard volta uma etapa.
- Comando `/cancelar` mata estado.

## Mudanças técnicas

**Sem nova migration.** A tabela `telegram_chat_state` já tem `data jsonb` flexível.

### `supabase/functions/telegram-webhook/index.ts`
1. Adicionar steps: `awaiting_item` (substitui awaiting_item_search com mais contexto), `awaiting_qty_v2`, `awaiting_review`, `cart_main`, `cart_adding`.
2. Funções novas:
   - `wzPushHistory(state)` / `wzPopHistory(chatId)` — stack de navegação.
   - `wzMainMenuV2(chatId)` — menu rico com contadores (1 query a `inventory_items`).
   - `wzTopMovedItems(action, limit=5)` — query nas últimas 30d em `inventory_movements`.
   - `wzItemContextKeyboard(item, action)` — Tela 3 com saldo + sugestões smart.
   - `wzReviewScreen(chatId, ...)` — Tela 4 com preview e "fazer outra".
   - `wzCartAdd/wzCartList/wzCartApply` — modo carrinho.
   - `wzMassOpPreview(scope, action, qty)` — Tela 5 detalhada (preview top 5 + total).
3. Novos `callback_data`:
   - `wz|back` — voltar
   - `wz|home` — menu principal
   - `wz|repeat` — confirmar e fazer outra
   - `wz|cart|add|<itemId>|<qty>|<type>`
   - `wz|cart|apply` / `wz|cart|clear` / `wz|cart|view`
   - `wz|item|<itemId>` — selecionar item da lista
   - `wz|massview` — ver lista completa de operação em massa
4. Texto livre: durante `awaiting_item` busca incremental com debounce (mostra resultados a cada msg). Durante `awaiting_qty` aceita número OU expressão simples (`+24`, `-3`, `=50`).
5. Mensagens editadas (não criar nova msg a cada passo) — reduz spam no chat.

### `.lovable/memory/features/telegram-bot.md`
Atualizar documentação dos novos steps e callbacks.

## Diagrama do fluxo

```text
┌─ Menu principal ────────────────────────┐
│ Entrada/Saída/Ajuste │ Carrinho │ Buscar│
└──┬─────────────┬──────┴─────┬───────────┘
   │             │            │
   v             v            v
┌──Item─────┐  ┌Carrinho┐   ┌Search┐
│top5+busca │  │ rascunho│   │       │
└─────┬─────┘  └────┬────┘  └───────┘
      v             │
┌──Qtd──────┐       │
│sugest+ctx │       │
└─────┬─────┘       │
      v             │
┌──Review───┐       │
│preview    │←──────┘ (cart add)
└──┬─┬──────┘
   │ └─ Confirmar e fazer outra ─┐
   v                             │
┌──Resultado─┐                   │
│undo+repeat │                   │
└────────────┘ ──────────────────┘
```

## Compatibilidade

- Comandos diretos (`entrada 10 coca`, `ajuste coca 50`, `lista estoque` etc.) continuam idênticos.
- Wizard antigo (`wz|act|*`, `wz|scope|*`, `wz|qty|*`, `wz|confirm`) **substituído** — código removido pra não duplicar.
- `gerenciar estoque` continua sendo o gatilho.

