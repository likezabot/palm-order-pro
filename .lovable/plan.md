## Automação Telegram → Edição de pedidos por texto

### Visão geral do fluxo

```text
Telegram user
   │  "mesa 3 + 1 coca"
   ▼
Bot do Telegram
   │  POST update
   ▼
Edge Function `telegram-webhook` (já existe — substituir o eco)
   │
   ├─ 1. Parse do texto              → { table, op, qty, productText }
   ├─ 2. Resolve mesa                → busca order ativa
   ├─ 3. Resolve produto             → find_inventory_item_by_text → product_id
   ├─ 4. Decide create vs update     → RPC apropriado
   ├─ 5. Retry em version_conflict   → até 3x
   └─ 6. sendMessage de resposta
```

### 1. Parser de comandos

Parser único baseado em regex tolerante a acento/case. Normaliza com `.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")`.

Gramática suportada:


| Comando                                  | Regex semântica | Ação         |
| ---------------------------------------- | --------------- | ------------ |
| `mesa <N> + <qty> <produto>`             | adicionar       | `ADD`        |
| `mesa <N> - <qty> <produto>`             | remover         | `REMOVE`     |
| `mesa <N> ver pedido`                    | consulta        | `VIEW`       |
| `mesa <N> cancelar <produto>` *(futuro)* | zera item       | `REMOVE_ALL` |
| `ajuda` / `/start` / `/help`             | help            | `HELP`       |


Aliases de operador: `+` ou `add` ou `adiciona` ou `adicionar`; `-` ou `remove` ou `tira`. Quantidade default `1` se omitida (`mesa 3 + coca` → qty=1).

Saída do parser:

```ts
type Command =
  | { kind: "ADD" | "REMOVE"; table: string; qty: number; productText: string }
  | { kind: "VIEW"; table: string }
  | { kind: "HELP" }
  | { kind: "PARSE_ERROR"; raw: string };
```

### 2. Resolução da mesa

```sql
SELECT * FROM orders
WHERE status IN ('new','preparing','done')
  AND (original_table_name = $1 OR (original_table_name IS NULL AND table_name = $1))
ORDER BY created_at DESC LIMIT 1;
```

- Se não achar e operação é `ADD`: criar via `create_order` (mesa nova).
- Se não achar e operação é `REMOVE`/`VIEW`: responder "Mesa X não tem pedido aberto."
- `table_name` é texto livre — usamos o número como string ("3", não 3).

### 3. Resolução do produto

Pipeline em 3 etapas (do mais preciso ao mais frouxo):

1. `find_inventory_item_by_text(productText)` — match exato em `slug` ou `aliases`.
2. **Fallback fuzzy**: `SELECT * FROM inventory_items WHERE is_active AND lower(unaccent(name)) ILIKE '%' || $1 || '%' LIMIT 5`.
3. Para cada inventory item resolvido, pegar `product_id`. Se nulo → "Item de estoque sem produto vinculado, não pode ir pro pedido."
4. Resolver o `Product` real via `SELECT * FROM products WHERE id = $1 AND active = true`.

**Verificação de grupo**: depois de achar o produto, ler `settings.product_groups`. Se o produto for `trigger_product_name` de algum grupo, responder pedindo a variante (ver §7).

**Resultado**:

```ts
type ProductResolution =
  | { kind: "found"; product: Product }
  | { kind: "ambiguous"; candidates: Product[] }   // 2-5 matches
  | { kind: "not_found" }
  | { kind: "is_group_trigger"; group: ProductGroup; variants: Product[] }
  | { kind: "out_of_stock"; product: Product }     // product.active=false
  | { kind: "no_linked_product"; itemName: string };
```

### 4. Fluxo `create_order` (mesa sem pedido aberto, op=ADD)

```ts
await rpc("create_order", {
  p_table_name: "3",
  p_original_table_name: "3",
  p_waiter_name: "Telegram",         // identificador fixo do bot
  p_total: product.price * qty,
  p_items: [{
    product_id, product_name, product_price: price,
    quantity: qty, subtotal: price*qty, note: null
  }],
  p_should_print: true,
});
```

Resposta: `✅ Mesa 3 criada com 1× Coca-Cola — R$ 7,00`.

Se `create_order` lançar `table_already_in_use` (corrida com PALM): re-resolver mesa e cair no fluxo §5.

### 5. Fluxo `update_order_items` (pedido já existe)

Operação não-destrutiva: o RPC substitui a lista inteira, então temos que reconstruir.

```ts
// 1. Carregar estado atual
const { data: items } = await sb.from("order_items").select("*").eq("order_id", orderId);
const expectedVersion = order.version;

// 2. Mesclar
const merged = applyOp(items, op, qty, product);
//    ADD: se produto+note já existe → soma quantity; senão push
//    REMOVE: decrementa; se quantity ≤ 0 → remove linha; se não existe → erro "Não tem X na mesa"

// 3. Calcular delta para impressão extra
const delta = computeDelta(items, merged);  // só itens novos/aumentados → print_type "extra"
const total = merged.reduce((s,i) => s + i.subtotal, 0);

// 4. RPC
await rpc("update_order_items", {
  p_order_id: orderId,
  p_total: total,
  p_items: merged.map(toJson),
  p_delta_items: op === "ADD" ? delta : null,
  p_print_type: op === "ADD" ? "extra" : null,
  p_expected_version: expectedVersion,
  p_should_print: op === "ADD",     // REMOVE não imprime
});
```

`REMOVE` nunca imprime (`p_should_print=false`) e não envia delta — só recalcula total.

### 6. Tratamento de `version_conflict` (retry)

```ts
async function withVersionRetry(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (!e.message?.includes("version_conflict")) throw e;
      if (attempt === maxAttempts) throw e;
      await sleep(150 * attempt);   // backoff: 150/300/450ms
      // fn() recarrega order+items+version do zero
    }
  }
}
```

A função `fn` lê `order` + `order_items` + `version` no início, então cada retry pega o estado atual. Após 3 falhas: responder "Mesa 3 está sendo editada por outro usuário, tente de novo."

### 7. Produto ambíguo / casos especiais


| Caso                                    | Resposta do bot                                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `not_found`                             | `❓ Produto "X" não encontrado. Tente outro nome ou /ajuda.`                                                                                  |
| `ambiguous` (2-5 candidatos)            | `🤔 Encontrei vários: 1) Coca-Cola 350ml 2) Coca Zero 350ml 3) Coca 600ml. Repita usando o nome completo.` (sem stateful — usuário re-envia) |
| `is_group_trigger`                      | `📦 "Refri 350ml" é um grupo. Variantes: Coca-Cola 350ml, Guaraná 350ml, Sprite 350ml. Repita com a variante.`                               |
| `out_of_stock` (`product.active=false`) | `❌ X está marcado como esgotado.`                                                                                                            |
| `no_linked_product`                     | `⚠️ X existe no estoque mas não está vinculado a nenhum produto do cardápio.`                                                                |
| REMOVE de item inexistente              | `⚠️ Mesa 3 não tem "X".`                                                                                                                     |
| REMOVE qty > existente                  | Remove tudo + avisa `Removidos 2 (mesa só tinha 2).`                                                                                         |


Nenhum estado conversacional na v1: sem "responda 1/2/3". Usuário re-envia comando completo.

### 8. Mensagens de resposta do bot

Padrão visual (HTML parse_mode):

```text
✅ Mesa 3 → +1 Coca-Cola 350ml (R$ 7,00)
   Total da mesa: R$ 42,50 (5 itens)

➖ Mesa 3 → -1 Água
   Total da mesa: R$ 35,50 (4 itens)

📋 Mesa 3:
   2× Bovino — R$ 30,00
   1× Coca-Cola — R$ 7,00
   1× Água — R$ 5,00
   ───────────────
   Total: R$ 42,00
```

`HELP`:

```text
Comandos:
• mesa <N> + <qtd> <produto>
• mesa <N> - <qtd> <produto>
• mesa <N> ver pedido
Exemplos: "mesa 3 + 2 coca", "mesa 1 ver pedido"
```

### 9. Estoque

**v1: bot NÃO mexe em estoque.**

Razão: o sistema atual já não decrementa estoque na venda do PDV (decisão arquitetural existente — abater no Telegram criaria inconsistência onde só vendas via bot saem do estoque). Mantemos `apply_inventory_movement` exclusivamente para movimentações manuais e o futuro fluxo de Telegram **"entrada de estoque"** (escopo separado).

Decisão registrada como memória do projeto (`mem://features/telegram-bot`).

Se no futuro quisermos automatizar saída: aplicar `apply_inventory_movement(type='out', source='telegram')` para cada item adicionado, **e fazer o mesmo no PDV** para manter consistência — fora do escopo desta automação.

### Arquitetura técnica

**Arquivos**

- `supabase/functions/telegram-webhook/index.ts` — substituir o eco atual pela lógica completa.
  - Estrutura interna em módulos lógicos (mesmo arquivo, sem subpastas):
    - `parseCommand(text)` → `Command`
    - `resolveTable(sb, table)` → `Order | null`
    - `resolveProduct(sb, text)` → `ProductResolution`
    - `applyAdd / applyRemove` (puro, sobre array)
    - `executeAdd / executeRemove / executeView` (chamam RPCs com retry)
    - `formatReply(result)` → string HTML
    - `sendTelegram(chatId, text)` via gateway

**Cliente Supabase**: usar `SUPABASE_SERVICE_ROLE_KEY` (já configurado) — webhook não tem usuário autenticado, e RLS é aberto mesmo, mas service role evita surpresas com policies futuras.

**Telegram API**: já existe `TELEGRAM_BOT_TOKEN`. Plano usa chamada direta `https://api.telegram.org/bot<TOKEN>/sendMessage` (igual ao código atual) — **não** o connector gateway, para evitar dependência adicional. Se preferir gateway depois, troca trivial.

**Webhook**: assumir que já está configurado apontando para a edge function. Se não estiver, instrução final: setar via `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<edge-function-url>`.

### O que NÃO faz parte desta entrega

- Múltiplos produtos no mesmo comando (`mesa 3 + 1 coca + 2 água`).
- Notas/observações no item (`mesa 3 + 1 bovino sem cebola`).
- Pagamento, fechamento, mover mesa via Telegram.
- Estado conversacional ("escolha 1/2/3").
- Movimentação de estoque pelo bot.
- Autenticação por chat_id (qualquer pessoa que mandar mensagem ao bot consegue editar). **Recomendo adicionar whitelist de** `chat_id` **permitidos** como pequeno guard antes do parser — confirmar se quer isso já na v1.

### Riscos e mitigações


| Risco                                 | Mitigação                                                         |
| ------------------------------------- | ----------------------------------------------------------------- |
| Race com PALM editando mesma mesa     | Retry 3× em `version_conflict` + mensagem clara.                  |
| Bot loop (resposta dispara webhook?)  | `update.message.from.is_bot` → ignorar.                           |
| Duplicação por re-entrega do Telegram | Deduplicar por `update_id` em memória local da função (TTL 5min). |
| Comando ambíguo manda item errado     | Resposta de ambiguidade exige re-envio explícito; nunca chuta.    |
| Mesa "BALCÃO" via bot                 | Bloquear: bot só opera mesas numéricas (regex `^\d+$`).           |
| Texto fora do padrão                  | `PARSE_ERROR` → manda mensagem de ajuda.                          |


### Confirmação antes de implementar

1. **Whitelist de** `chat_id`: adicionar já na v1 (lista em `settings.telegram_allowed_chats`) ou deixar aberto?
2. **Identificação do garçom**: usar `"Telegram"` fixo, ou `"Telegram (@username)"` extraído do `message.from.username`?
  Plano aprovado com estas decisões para a v1:

1. Quero whitelist de chat_id já na v1.

Use uma lista de chats permitidos (ex: settings.telegram_allowed_chats) e bloqueie qualquer chat não autorizado.

&nbsp;

2. Na identificação do garçom/autor da ação, use:

- "Telegram (@username)" quando houver username

- fallback para "Telegram" quando não houver

&nbsp;

3. Pode manter o escopo da v1 sem mexer em estoque.

Quero apenas edição de pedidos por texto no Telegram.

&nbsp;

4. Em casos ambíguos, nunca chute produto.

Quero sempre resposta pedindo que o usuário reenvie com nome mais específico.

&nbsp;

Pode seguir para implementação com essas regras.