

## Parser Telegram: variações naturais para VIEW

### Mudança (arquivo único: `supabase/functions/telegram-webhook/index.ts`)

Hoje o parser só reconhece VIEW via regex `mesa N ver pedido`. Vou ampliar o reconhecimento para frases naturais sem afetar ADD/REMOVE.

### Como detectar VIEW

Adicionar uma etapa **antes** de tentar ADD/REMOVE no `parseCommand`:

1. Extrair número de mesa da frase (regex tolerante: `/mesa\s+(\d+)/i` ou `/\bm\s*(\d+)\b/i`).
2. Se há mesa **e** a frase contém algum **verbo/substantivo de consulta**, retorna `{ kind: "VIEW", table: N }`.
3. Caso contrário, segue o fluxo atual (ADD/REMOVE/HELP/PARSE_ERROR).

### Dicionário de gatilhos VIEW

Lista de tokens (normalizados, sem acento, lowercase) — basta **um** deles aparecer junto com a mesa:

- `ver`, `vê`
- `consulta`, `consultar`, `consulte`
- `total`, `totais`
- `pedido`, `pedidos`
- `mostra`, `mostrar`, `mostre`
- `lista`, `listar`, `liste`
- `resumo`
- `como esta`, `como ta`, `como anda` (frases compostas — checagem por `includes`)
- `quanto`, `quanto deu`, `quanto ficou`
- `extrato`, `conta`

### Anti-conflito com ADD/REMOVE

VIEW só dispara se a linha **NÃO contiver**:

- Operador explícito ADD/REMOVE (`+`, `-`, `add`, `adiciona`, `coloca`, `tira`, `remove`, `mais`, `menos`, etc. — reaproveitar `ADD_OPS`/`REM_OPS`).
- Quantidade numérica fora do número de mesa (ex: `mesa 1 + 2 coca` nunca cai em VIEW).

Heurística: detectar VIEW só quando **não há operador** E **não há `<qty> <produto>`** após a mesa. Se tiver dúvida, segue o caminho atual (ADD/REMOVE) — preserva regra "sem chute".

### Exemplos cobertos

| Entrada | Resultado |
|---|---|
| `mesa 1 ver pedido` | VIEW mesa 1 (já funciona) |
| `mesa 1 consulta` / `mesa 1 consultar` | VIEW mesa 1 |
| `consultar mesa 1` / `ver mesa 1` | VIEW mesa 1 |
| `total mesa 1` / `total da mesa 1` | VIEW mesa 1 |
| `como está a mesa 1` / `como ta a mesa 1` | VIEW mesa 1 |
| `quanto deu a mesa 3` | VIEW mesa 3 |
| `mesa 1 + 1 bovino` | ADD (inalterado) |
| `mesa 1 mais um bovino` | ADD (inalterado, "mais" é ADD_OP) |
| `mesa 1` (sozinho) | PARSE_ERROR (sem gatilho) |

### Multi-comando, preview e botões

- Funciona dentro de cada linha do split (regra atual).
- `previewCommand` para VIEW já existe — sem mudanças.
- VIEW nunca emite inline keyboard.

### Garantias

- **Compatibilidade total**: regex atual `mesa N ver pedido` continua funcionando (cai no novo gatilho).
- **Sem ambiguidade silenciosa**: gatilhos VIEW só disparam quando claramente não há ADD/REMOVE.
- **Sem mudança em banco, executeView, RLS, fluxo de execução**.
- **Conflito com `mais`**: a palavra `mais` continua sendo ADD_OP — frases como "mesa 1 mais 1 coca" não viram VIEW por causa da checagem de operador/qty.

### Atualização da memória

`mem://features/telegram-bot.md` ganha lista de gatilhos VIEW + nota sobre anti-conflito com ADD/REMOVE.

### Fora de escopo

- Frases sem mesa explícita (ex: "ver tudo", "todas as mesas").
- Filtros parciais (ex: "mesa 1 só bebidas").
- Plurais de gatilhos além dos listados.

