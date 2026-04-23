

# Mensagens separadas por mesa + Desfazer identificado + Consulta com itens

## O problema (pelo print)
Hoje no áudio com 4 comandos o bot manda **uma mensagem única** com tudo amontoado:
- `🍽️ Lancei: ✅ Mesa 2 (1 ações):` — não mostra QUAL item foi lançado
- `🍽️ Lancei: ✅ Mesa 1 criada:` — corta antes do nome do produto
- `📋 Mesa 3:` — a consulta sumiu (não mostra valor nem itens)
- 3 botões `↩️ Desfazer (60s)` idênticos no rodapé — impossível saber qual desfaz qual mesa

A causa: o código pega só a **primeira linha** de cada resultado (`firstLineOf`) pra montar bullets, e os botões de Desfazer não têm rótulo da mesa. A mensagem consolidada também trunca a consulta da mesa 3.

## Mudanças em `supabase/functions/telegram-webhook/index.ts`

### 1. Uma mensagem por mesa/ação (em vez de bullets consolidados)
No bloco multi-comando de voz (linhas ~4927-4958), substituir a mensagem única por **N mensagens separadas**, na ordem:

1. **Cabeçalho curto** editando a mensagem "🎤 Ouvindo…":
   ```
   🎤 Ouvi: "lança 2 boi na mesa 2 / lança 1 boi mesa 1 / ..."
   ✅ Processando 4 ações...
   ```
2. **Uma mensagem por mesa** (com texto **completo** do resultado, não só primeira linha) + botão Desfazer **dessa mesa específica**:
   ```
   🍽️ Mesa 2 — Lancei
   • 2× Bovino — R$ 36,00
   Total da mesa: R$ 36,00 (2 itens)
   [↩️ Desfazer Mesa 2 (60s)]
   ```
3. **Uma mensagem por consulta** com valor + itens completos:
   ```
   👀 Mesa 3 — Conta atual
   • 1× Bovino — R$ 18,00
   • 2× Coca 350 — R$ 12,00
   Total: R$ 30,00 (3 itens)
   ```
4. **Mensagem separada por escolha pendente** (já é assim hoje no fluxo texto, vai passar a valer pra voz também).

### 2. Botão Desfazer identificado por mesa
Trocar o rótulo do botão em `buildUndoBatchKeyboard` quando vier do fluxo voz/multi: usar `↩️ Desfazer Mesa ${table} (60s)` em vez de `↩️ Desfazer (60s)`. Já temos a mesa no escopo de `batchResults`. Como o helper é compartilhado, vou aceitar um parâmetro opcional `tableLabel?: string` e passá-lo nas chamadas do bloco multi-comando.

### 3. Consulta (VIEW) volta a mostrar valor + itens na mensagem separada
A consulta hoje é truncada porque entra no mesmo `firstLineOf`. Como cada ação vira uma mensagem independente, o handler de VIEW devolve seu texto completo (já formata `Total: ... (N itens)` + lista) e ele é enviado direto sem corte.

### 4. Cabeçalho/rodapé curto e dinâmico
- Se TUDO deu certo: cabeçalho final editado pra `✅ 4/4 concluído`.
- Se houver erro/escolha pendente em alguma mesa: `⚠️ 3/4 concluído — 1 precisa de atenção` (e a mensagem da mesa problemática traz os botões).
- Sem mais "Pronto: • bullet • bullet" — cada mesa fala por si.

### 5. Ordem das mensagens preserva a fala
Mando na ordem em que apareceram no áudio (`renderedSlots` já está ordenado). Cada mensagem tem o número da mesa em destaque pro garçom rastrear visualmente sem ler bullets.

## O que NÃO muda
- Fluxo de texto (digitado) continua com `📊 N comandos processados` + bullets, pois nesse caso o usuário tá olhando o teclado e prefere uma mensagem só. A mudança é específica do caminho voz.
- Confiança/auto-execução do óbvio, picker por linha ambígua, prompt do Gemini, vínculo de garçom, impressão, kanban — tudo igual.
- Indicador `🎤 Ouvindo…` continua editando a primeira mensagem (que vira o cabeçalho final).
- Tokens de undo, TTL 60s, callbacks `udo|...` — inalterados.

## Arquivo afetado
- `supabase/functions/telegram-webhook/index.ts` — refator do bloco voz multi-comando (linhas ~4927-4972), parâmetro `tableLabel` opcional em `buildUndoBatchKeyboard`.

## Critério de sucesso
1. Áudio do print (4 ações) → 1 mensagem cabeçalho `🎤 Ouvi:...` + 3 mensagens de Lancei (mesas 1, 2, 10) cada uma com seu próprio `[↩️ Desfazer Mesa X (60s)]` + 1 mensagem `👀 Mesa 3 — Conta atual` com itens e total.
2. Cada botão Desfazer mostra explicitamente qual mesa vai desfazer.
3. A consulta da mesa nunca mais aparece truncada como `Mesa 3:`.
4. Áudio simples "mesa 2 mais 2 bovino" → continua 1 mensagem só (porque é 1 ação) com `[↩️ Desfazer Mesa 2 (60s)]`.

