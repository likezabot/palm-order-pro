

## Mais aliases + múltiplos comandos na mesma mensagem

### O que já existe (não quebrar)
- Multi-linha já funciona: separa por `\n`, até 10 comandos, consolida ADD/REMOVE da mesma mesa em 1 só impressão.
- Vários aliases já cobertos (ver/listar/mostrar, +/add/coloca/poe/manda/bota/mais, -/tira/retira/remove/cancela, entrada/entrou/chegou/recebi, saida/usei/gastei/tirei, ajuste/setar/atualiza/tem N).

### O que falta — vou adicionar

**1. Mais separadores na mesma linha** (não só `\n`)
Hoje só `\n` quebra comandos. Vou aceitar também:
- `;` ponto-e-vírgula → "mesa 1 +1 coca; mesa 2 +2 cerva"
- ` // ` ou ` | ` → "mesa 1 +1 coca | mesa 2 +2 cerva"
- Quebra automática quando aparece outro `mesa N` no meio: "mesa 1 +1 coca mesa 2 +2 cerva" (só se ambos os lados têm operador/ação válida; conservador para não quebrar pedidos de produtos com "mesa" no nome).
- Limite continua 10 comandos por mensagem.

**2. Mais aliases para comandos existentes**

| Comando | Aliases novos |
|---|---|
| HELP | `?`, `comando`, `o que faz`, `como usar`, `me ajuda`, `socorro` |
| UNDO | `apaga ultimo`, `tira ultimo`, `errei`, `oops`, `voltar atras`, `reverter` |
| REPORT | `report`, `dia`, `como foi o dia`, `vendas hoje`, `total do dia`, `caixa` |
| STOCK_CRITICAL | `alertas`, `alerta estoque`, `o que falta`, `precisa repor`, `repor`, `lista critica` |
| STOCK_QUERY | `quanto de X`, `quanta X tem`, `tem X?`, `qtd X`, `ver estoque X`, `consulta estoque X` |
| STOCK_IN | `repor 10 coca`, `abasteci 5 coca`, `entregou 20 cerva`, `subir 10 coca` |
| STOCK_OUT | `vendi 3 coca` (estoque, não pedido), `acabou 2 coca`, `quebrou 1 prato`, `descartei 2 coca`, `perdi 1 picanha` |
| STOCK_ADJUSTMENT | `contei 50 coca`, `inventario coca 50`, `corrige coca 50`, `marca coca 50` |
| TABLE_STATUS | `mesa N como ta`, `como ta mesa N`, `andamento mesa N`, `mesa N tudo certo` |
| VIEW | `mesa N o que tem`, `mesa N consumo`, `o que tem na mesa N`, `consumo mesa N` |
| SET_TABLE | `vou pra mesa N`, `na mesa N`, `pegando mesa N`, `mesa N agora` |
| NOTIFY_TOGGLE | `silencia`, `muta`, `silenciar alertas`, `parar avisos`, `volta avisos` |

**3. Novo comando: `LISTAR` (sem ser crítico)**
- `lista estoque`, `inventario`, `tudo do estoque`, `todos itens` → mostra todos os itens ativos com saldo (limitado a 30, paginação simples se passar).

**4. Help atualizado**
Reescreve `/help` agrupando por categoria com 3-5 exemplos por bloco (PEDIDOS, CONSULTA, ESTOQUE, OUTROS), citando os separadores `;` `|` e quebra de linha.

### Onde mexer
- `supabase/functions/telegram-webhook/index.ts`:
  - Função nova `splitCommands(text)` que aplica `\n`, `;`, ` // `, ` | ` e split conservador por `\bmesa\s+\d+\b` no meio. Substitui o `text.split(/\r?\n/)` no handler.
  - Adicionar regex/aliases nas seções correspondentes do `parseCommand`.
  - Novo kind `STOCK_LIST` + handler que faz `select * from inventory_items where is_active=true order by name limit 30`.
  - Atualizar `buildHelp()`.
- `.lovable/memory/features/telegram-bot.md`: documentar novos separadores, aliases e `STOCK_LIST`.

### Validação
1. `mesa 1 +1 coca; mesa 1 +2 cerva` → 1 impressão consolidada na mesa 1.
2. `mesa 1 +1 coca | mesa 2 +1 cerva` → 2 impressões (mesas distintas).
3. `errei` após pedido → desfaz último.
4. `vendi 3 coca` (DM, sem mesa) → saída de estoque com botão Desfazer.
5. `lista estoque` → mostra até 30 itens com saldo.
6. `?` → abre help.
7. `mesa 1 o que tem` → VIEW.

Sem migrations, só edge function.

