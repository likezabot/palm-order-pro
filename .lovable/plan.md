

## Multi-comando por linha no bot do Telegram

### Mudança (arquivo único: `supabase/functions/telegram-webhook/index.ts`)

Hoje `Deno.serve` chama `parseCommand(text)` uma única vez. Vou trocar por um wrapper que quebra a mensagem em linhas, processa cada uma de forma independente e devolve uma resposta consolidada. Parser, `resolveProduct`, `executeAdd`/`executeRemove`/`executeView` ficam intocados.

### Como fica o roteamento

1. Receber `text` do Telegram.
2. `lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)` → ignora linhas vazias.
3. **1 linha** → comportamento atual (zero diferença visível para mensagens normais).
4. **2+ linhas** → roda em loop sequencial (ordem original); para cada linha:
   - `parseCommand(line)` → `handleCommand(cmd, waiter)`.
   - Captura a resposta (string) e adiciona a um array `results`.
   - Se `handleCommand` lançar exceção inesperada, captura e adiciona `❌ "<linha>": erro inesperado` — **não interrompe** as demais (regra 8).
5. Monta resposta final juntando os resultados.

### Limites de segurança

- **Máx. 10 linhas por mensagem**. Acima disso responde `⚠️ Máx. 10 comandos por mensagem. Você enviou N. Divida em mensagens menores.` e não executa nada.
- **Execução estritamente sequencial** (await em série, não `Promise.all`) — evita corrida de versão na mesma mesa.
- **Dedupe inalterado**: a mensagem inteira ainda conta como 1 `update_id` (Telegram envia 1 update por mensagem).
- **HELP e PARSE_ERROR por linha**: se uma linha for "ajuda" no meio do bloco, retorna o HELP só pra essa linha (não interrompe o resto).

### Formato da resposta consolidada

Para mensagens multi-linha, formato compacto (uma seção por linha):

```
📊 4 comandos processados:

✅ Mesa 1 → +1 Bovino (R$ 12,00)
   Total da mesa: R$ 24,00 (2 itens)

✅ Mesa 1 → +1 Coca-Cola 350ml (R$ 7,00)
   Total da mesa: R$ 31,00 (3 itens)

➖ Mesa 1 → -1 Água sem gás
   Total da mesa: R$ 27,00 (2 itens)

📋 Mesa 1:
   2× Bovino — R$ 24,00
   1× Coca-Cola 350ml — R$ 7,00
   ───────────────
   Total: R$ 31,00
```

Erros aparecem inline, na posição da linha, sem abortar:

```
✅ Mesa 1 → +1 Bovino ...
🤔 Encontrei várias opções para "coca": ...
✅ Mesa 1 → +1 Água sem gás ...
```

### Garantias

- **Compatibilidade total**: 1 linha = comportamento idêntico ao atual (mesma resposta, sem cabeçalho extra).
- **Linguagem natural**: já suportada desde a iteração anterior — nada a mudar no parser.
- **Sem ambiguidade silenciosa**: `resolveProduct` continua devolvendo `ambiguous`/`is_group_trigger` por linha; cada um vira sua própria resposta.
- **Falha isolada**: cada linha tem try/catch próprio.
- **Sem mudança em banco, fluxo de pedido, RLS, dedupe, whitelist**.

### Atualização da memória

`mem://features/telegram-bot.md` ganha 2 linhas: "Multi-comando: 1 por linha, máx 10, execução sequencial, falha de uma linha não bloqueia as outras."

### Fora de escopo

- Paralelização (intencionalmente sequencial).
- Transação atômica entre linhas (cada linha é independente — se a 2ª falhar, a 1ª permanece aplicada).
- Continuação cross-message (cada mensagem é autocontida).

