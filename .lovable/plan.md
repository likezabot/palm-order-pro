

## Parser do Telegram: linguagem natural

### Diagnóstico do parser atual

O parser já cobre 4 dos 5 exemplos pedidos via Formas 1/2/3 e os dicionários `ADD_OPS`/`REM_OPS`. Único caso que falha hoje:

- **"mesa 1 mais um bovino"** — falta o operador `mais` e o número por extenso `um`.

Os outros exemplos já funcionam (testados mentalmente contra os regexes existentes). O plano abaixo fecha esse gap sem mexer no fluxo de execução.

### Mudanças no `parseCommand` (arquivo único: `supabase/functions/telegram-webhook/index.ts`)

**1. Expandir dicionários de operadores**
- `ADD_OPS` ganha: `mais`, `soma`, `somar`, `inclui`, `incluir`, `acrescenta`, `acrescentar`
- `REM_OPS` ganha: `menos`, `subtrai`, `subtrair`, `exclui`, `excluir`, `desconta`, `descontar`

**2. Suporte a números por extenso (1–10)**
- Novo helper `parseQty(token)` que aceita dígito (`"2"`) ou palavra (`um`, `uma`, `dois`, `duas`, `tres`, `quatro`, `cinco`, `seis`, `sete`, `oito`, `nove`, `dez`).
- Usado dentro de `extractQtyProduct`: se o primeiro token for dígito OU palavra-número, vira `qty` e o resto vira `productText`. Senão, `qty=1` e tudo é produto (comportamento atual).

**3. Sem novas regex de forma**
- As 3 formas existentes (canônica, com preposição, sem preposição) continuam idênticas. A expansão dos dicionários e do `extractQtyProduct` é suficiente para cobrir todos os exemplos.

### Validação dos casos pedidos após mudança

| Entrada | Forma | Resultado |
|---|---|---|
| `mesa 1 + 1 bovino` | F1 | ADD mesa=1 qty=1 bovino ✅ (regressão) |
| `mesa 1 mais um bovino` | F1 | ADD mesa=1 qty=1 bovino ✅ (novo) |
| `adiciona 1 bovino na mesa 1` | F2 | ADD mesa=1 qty=1 bovino ✅ |
| `mesa 1 coloca 2 coca 350` | F1 | ADD mesa=1 qty=2 "coca 350" ✅ |
| `tira 1 agua da mesa 2` | F2 | REMOVE mesa=2 qty=1 agua ✅ |
| `remove 1 tulipa mesa 3` | F3 | REMOVE mesa=3 qty=1 tulipa ✅ |

### Garantias mantidas

- **Compatibilidade total**: nenhuma regra antiga removida; apenas adições.
- **Mesmo fluxo de execução**: `executeAdd`/`executeRemove`/`resolveProduct` intocados.
- **Sem ambiguidade silenciosa**: `resolveProduct` continua devolvendo `ambiguous` → bot pede para especificar. Aliases curtos ambíguos (coca, fanta…) seguem fora do dicionário.
- **Um comando por mensagem**: parser já trata a mensagem como expressão única (sem split por `;` ou `\n`); nada muda.
- **Sem chute de produto**: a tradução natural→canônico acontece só no parser (operador + qty); a resolução do produto não é afetada.

### O que NÃO entra nesta etapa

- Múltiplos comandos numa mesma mensagem.
- Plurais/concordância no nome do produto (delegado ao fuzzy de `resolveProduct`).
- Números acima de 10 por extenso (raro em pedido de mesa; dígito segue funcionando).
- Mudanças em testes/memória (alteração é mínima e contida no parser).

