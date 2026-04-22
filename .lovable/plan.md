

# Corrigir parser do Telegram para entrada de estoque em lote

## Problemas identificados na mensagem

```
Entrada de estoque medalhão 20    ← não reconhecido (frase "de estoque" + ordem invertida)
Meio da asa 15                     ← não reconhecido (sem verbo de ação)
Coração 17                         ← idem
Linguiça 30                        ← idem
```

O parser atual exige `entrada <qty> <produto>` por linha. O usuário escreveu em formato natural de **lista de contagem**: cabeçalho com a ação + linhas só com `<produto> <qty>`.

## Solução

Refatorar o handler de mensagens em `supabase/functions/telegram-webhook/index.ts` para suportar **modo de operação herdada** em mensagens multi-linha de estoque.

### 1. Aceitar variações do verbo "entrada" (e saída/ajuste)

No regex `stockIn` (linha 517), aceitar sufixo opcional `de estoque`/`no estoque`:

- `entrada de estoque medalhão 20` ✅
- `saida do estoque 5 coca` ✅
- `chegou ao estoque 10 cerva` ✅

Mesmo tratamento para `stockOut` e os regex de AJUSTE.

### 2. Aceitar ordem invertida `<produto> <qty>`

Na função `parseStockTail` (linha 497), além de `<qty> [unit] <produto>`, aceitar também `<produto> <qty> [unit]` como fallback quando o formato canônico não casa. Isso permite:

- `entrada de estoque medalhão 20` → qty=20, item="medalhão"
- `entrada coca 10` → qty=10, item="coca"
- `entrada 10 coca` → continua funcionando (canônico)

### 3. Modo de operação herdada (CRÍTICO)

Quando uma mensagem tem múltiplas linhas e a **primeira linha** é um `STOCK_MOVEMENT` válido (in/out/adjustment), as linhas seguintes que **não** começam com verbo conhecido devem ser interpretadas como **continuação** com o mesmo tipo de operação.

Implementação no loop de processamento de comandos (perto da linha 3836, onde `for (const line of lines)` itera):

```ts
let inheritedStockType: "in" | "out" | "adjustment" | null = null;

for (const line of lines) {
  let cmd = parseCommand(line);
  
  // Se linha falhou no parse E temos tipo herdado E a linha parece "<produto> <qty>" ou "<qty> <produto>"
  if (cmd.kind === "PARSE_ERROR" && inheritedStockType) {
    const parsed = parseStockTail(line, true); // tenta os dois formatos
    if (parsed) {
      cmd = { kind: "STOCK_MOVEMENT", type: inheritedStockType, qty: parsed.qty, itemText: parsed.itemText, unit: parsed.unit };
    }
  }
  
  // Atualiza o tipo herdado quando a linha foi um STOCK_MOVEMENT bem parseado
  if (cmd.kind === "STOCK_MOVEMENT") {
    inheritedStockType = cmd.type;
  }
  
  // ... processa cmd como hoje
}
```

### 4. Resultado esperado

Mensagem do usuário:
```
Entrada de estoque medalhão 20
Meio da asa 15
Coração 17
Linguiça 30
```

Vira 4 comandos `STOCK_MOVEMENT type=in`:
- +20 medalhão
- +15 meio da asa
- +17 coração
- +30 linguiça

Resposta do bot agrupa as 4 confirmações com saldos antes/depois.

## Arquivos modificados

- `supabase/functions/telegram-webhook/index.ts`
  - `parseStockTail`: aceitar ordem `<produto> <qty>` como fallback.
  - Regex de `entrada`/`saida`/`ajuste`: aceitar sufixo opcional "de/do/no estoque".
  - Loop de processamento de linhas: adicionar variável `inheritedStockType` e fallback quando linha não parseia mas há tipo herdado.

## Não alterado

- Comportamento de pedidos (`mesa N + qty produto`).
- Wizard de estoque (botões).
- Dedupe, whitelist, identificação de waiter.
- Comandos diretos existentes continuam funcionando exatamente igual.

