

# Comandos Telegram para visibilidade de produtos (mostrar/ocultar/listar)

## Escopo

Adicionar 3 novos comandos ao bot Telegram, sem mexer em pedidos, impressão, pagamento, layout do cupom, estoque ou no parser existente:

- **Ocultar** produto: `ocultar X` / `esconder X` / `desativar X` / `tirar X do cardápio` / `tira X` → `products.active = false`
- **Mostrar** produto: `mostrar X` / `ativar X` / `colocar X no cardápio` / `voltar X` / `ativa X` → `products.active = true`
- **Listar**: `listar ocultos` / `ver ocultos` / `listar visíveis` / `listar cardapio` → relatório agrupado por categoria

Resposta refletida no Admin e Palm em <1s via Realtime.

## Mudanças

### 1. `supabase/functions/telegram-webhook/index.ts`

**Novos kinds no `Command` union:**
```ts
| { kind: "PRODUCT_HIDE"; query: string }
| { kind: "PRODUCT_SHOW"; query: string }
| { kind: "PRODUCT_LIST"; mode: "hidden" | "visible" | "all" }
| { kind: "PRODUCT_PICK"; choice: number }   // resposta "1", "2"...
```

**Parser (em `parseCommand`, antes dos blocos de estoque):**
- `^(?:ocultar|oculta|esconder|esconde|desativar|desativa|tirar|tira|remover|remove)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+?)(?:\s+(?:do|no)\s+cardapio)?$` → `PRODUCT_HIDE`
- `^(?:mostrar|mostra|ativar|ativa|exibir|exibe|colocar|coloca|voltar|volta|liberar|libera)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+?)(?:\s+(?:no|para o|pro)\s+cardapio)?$` → `PRODUCT_SHOW`
- `^(?:listar?|ver|mostra(?:r)?)\s+(ocultos?|escondidos?|desativados?|inativos?|invisiv\w*)$` → `PRODUCT_LIST mode=hidden`
- `^(?:listar?|ver|mostra(?:r)?)\s+(visiveis|ativos|ativ[oa]s|cardapio|menu|produtos?)$` → `PRODUCT_LIST mode=visible`
- `^\s*([1-9]|10)\s*$` quando há `telegram_chat_state.step = 'product_pick'` válido → `PRODUCT_PICK`

Importante: posicionar **antes** dos parsers de `STOCK_*` para não conflitar com "tirei", e **depois** do parser de pedido `mesa N + qty`. A heurística "começa com verbo conhecido sem `mesa`" evita ambiguidade.

**Novo bloco de handlers (em `handleCommand`, após STOCK_OUT_NOW):**

```ts
case "PRODUCT_HIDE":
case "PRODUCT_SHOW": {
  const desired = cmd.kind === "PRODUCT_HIDE" ? false : true;
  const matches = await fuzzyFindProducts(cmd.query); // busca em products (ativos+inativos), normalizada, ranqueada
  console.log("[telegram-product]", cmd.kind, "query:", cmd.query, "matches:", matches.length);
  if (matches.length === 0) {
    return `❓ Não encontrei produto parecido com: "${cmd.query}".`;
  }
  if (matches.length === 1) {
    const p = matches[0];
    if (p.active === desired) {
      return `ℹ️ "${p.name}" já está ${desired ? "ativo" : "oculto"}.`;
    }
    await sb.from("products").update({ active: desired }).eq("id", p.id);
    console.log("[telegram-product] updated", p.id, "active=", desired);
    return `${desired ? "✅ Ativado" : "🚫 Ocultado"}: ${p.name}`;
  }
  // multi → salva estado e devolve numerada
  await saveChatState(chatId, "product_pick", {
    action: cmd.kind, candidates: matches.slice(0, 9).map(p => ({ id: p.id, name: p.name, active: p.active }))
  }, 5 * 60); // TTL 5min
  return `Encontrei ${matches.length} produtos. Responda com o número:\n` +
         matches.slice(0,9).map((p,i)=>`${i+1}. ${p.name}${p.active?"":" (oculto)"}`).join("\n");
}

case "PRODUCT_PICK": {
  const state = await loadChatState(chatId, "product_pick");
  if (!state) return "⏰ Sem escolha pendente. Mande o comando de novo.";
  const idx = cmd.choice - 1;
  const pick = state.data.candidates[idx];
  if (!pick) return `❓ Número ${cmd.choice} fora da lista.`;
  const desired = state.data.action === "PRODUCT_HIDE" ? false : true;
  await sb.from("products").update({ active: desired }).eq("id", pick.id);
  await clearChatState(chatId);
  return `${desired ? "✅ Ativado" : "🚫 Ocultado"}: ${pick.name}`;
}

case "PRODUCT_LIST": {
  const q = sb.from("products").select("name, category, active").order("category").order("name");
  const { data } = cmd.mode === "hidden"
    ? await q.eq("active", false)
    : cmd.mode === "visible" ? await q.eq("active", true) : await q;
  if (!data?.length) return cmd.mode === "hidden" ? "✅ Nenhum produto oculto." : "Nenhum produto.";
  // agrupa por CATEGORY_LABELS
  const byCat = groupBy(data, p => p.category);
  const header = cmd.mode === "hidden" ? "🚫 Produtos ocultos:" : "📋 Produtos visíveis:";
  return header + "\n\n" + Object.entries(byCat).map(([cat, ps]) =>
    `*${labelCat(cat)}*\n` + ps.map(p => `• ${p.name}`).join("\n")
  ).join("\n\n");
}
```

**Nova função `fuzzyFindProducts(query)`:**
- Normaliza (lowercase, strip acentos, trim, singulariza simples)
- Busca **todos** `products` (sem filtrar `active`, pra poder reativar)
- Ranking: match exato > startsWith > includes > Levenshtein por token (≤2)
- Limita a 9 candidatos (cabe em 1-9 do teclado numérico)

Reutiliza helpers já existentes: `normalize()`, `singularize()`, `levenshtein()` do próprio arquivo.

**Helpers de estado:** `saveChatState/loadChatState/clearChatState` já existem (usados pelo wizard). Só passar `step="product_pick"`.

**Atualizar HELP** pra incluir os 3 novos comandos.

### 2. Realtime na tabela `products`

Migration idempotente:
```sql
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

### 3. `src/components/palm/MenuView.tsx` e `src/pages/Admin.tsx`

Adicionar `useEffect` com canal Supabase Realtime que invalida as queries de products quando recebe `postgres_changes`:

```ts
useEffect(() => {
  const ch = supabase.channel("products-rt")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" },
       () => queryClient.invalidateQueries({ queryKey: ["palm-products"] }))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}, [queryClient]);
```

Mesma coisa no Admin com `["admin-products"]`. Sem mudança no fetch existente (filtro `.eq("active", true)` no Palm continua certo — produtos ocultos somem).

### 4. Memória

Atualizar `mem://features/telegram-bot.md` listando os comandos novos.

## O que NÃO muda

- Parser de pedidos (`mesa N + qty …`), estoque, wizard, voz, undo, impressão, RPCs.
- Schema (só publication realtime, sem coluna nova).
- RLS de `products` (já permite update público — e a edge function usa service role).
- Restrição de segurança: bot **só** alterna `active`. Não permite alterar preço, deletar produto, alterar pedido pago, etc.

## Validação manual

1. `ocultar panceta` → some do Palm em <1s, aparece no Admin como inativo.
2. `mostrar panceta` → volta.
3. `coca` (após `ocultar coca`, se houver várias) → bot lista numerada; responder `2` aplica.
4. `listar ocultos` → texto agrupado por categoria.
5. `listar visíveis` → cardápio inteiro.
6. Voz "esconde a panceta" → mesmo efeito.
7. Pedido `mesa 5 + 2 cerveja` continua funcionando (não conflita com parser novo).

