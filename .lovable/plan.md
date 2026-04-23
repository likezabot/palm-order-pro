

# UX simples de retorno por voz (sem despejar resumo de estoque)

## O problema real
No áudio "lança o medalhão na mesa 2", o Gemini reescreveu como **"entrada medalhão de frango na mesa 2"** — a palavra "lança" ficou parecida com "entrada" e o transcritor "ajudou" demais. Aí o parser caiu em STOCK_MOVEMENT (entrada de estoque) em vez de criar um pedido na mesa 2. Por isso você vê saldo subindo de 2→4 unidades em vez de o medalhão ir pra mesa.

Além disso, hoje o bot manda **muita coisa de estoque** depois de cada comando (Saldo, "comandos processados", botão Desfazer, etc.). Você quer só uma confirmação curta tipo *"Entendi: lançar 1 medalhão na mesa 2"*.

## Mudanças

### 1. Não deixar "lança/lançar/joga" virar "entrada" na transcrição
No prompt do Gemini em `transcribeVoice` (`supabase/functions/telegram-webhook/index.ts` linhas 119-128), adicionar instrução explícita:
> "PRESERVE LITERALMENTE verbos de pedido: 'lança', 'lançar', 'joga', 'manda', 'marca', 'anota', 'pede'. NUNCA troque por 'entrada' ou 'saída'. 'entrada' e 'saída' só quando o usuário falar literalmente essas palavras."

### 2. Indicador "🎤 Ouvindo…" enquanto processa
Antes de chamar a transcrição, mandar uma mensagem curta `🎤 Ouvindo…` e guardar o `message_id`. Quando terminar de processar (sucesso, erro, ou pedindo confirmação), **editar essa mesma mensagem** com o resultado final usando `editMessageText`. Sem poluir o chat com mensagens novas.

### 3. Confirmação curta "Entendi: ..."
No caminho de áudio com confiança alta (auto-executa), trocar o atual `🎤 *Ouvi:* "..."` + bloco verboso por uma linha só:
> `🎤 Entendi: lançar 1× Medalhão de Frango na mesa 2 ✅`

Para múltiplos comandos:
> `🎤 Entendi:`  
> `• mesa 2 + 1× Medalhão de Frango ✅`  
> `• mesa 5 + 2× Coca ✅`

### 4. Esconder ruído de estoque no fluxo de voz
Quando o comando vier de áudio, **suprimir** as mensagens automáticas de:
- Saldo atualizado de estoque (📥 Entrada / Saldo: X unidade)
- Botão "↩️ Desfazer (60s)" individual
- "📊 N comandos processados"

Manter apenas erros (produto não encontrado, mesa ocupada) e a linha curta de "Entendi". Isso é controlado passando uma flag `silent: true` para os handlers de execução quando a origem é voz.

### 5. Balanço de estoque no relatório do fim do dia
Adicionar ao `daily-waiter-report` (edge function que já manda o ranking diário às 23h59) uma seção:
```
📦 Movimentação de estoque hoje
  • Medalhão de Frango: +4 entradas, −1 saída → saldo 5
  • Coca: −12 saídas → saldo 8
  ⚠️ Críticos: Cerveja (saldo 2, mín 5)
```
Consulta `inventory_movements` agrupado por item no dia + `inventory_items.current_stock`/`min_stock`. Sem mexer em pedidos nem alertas em tempo real (alertas críticos imediatos seguem funcionando como hoje).

## O que NÃO muda
- Parser de texto, fluxo de pedidos, impressão, kanban da cozinha, cardápio, apelidos.
- Comandos de estoque por texto (`entrada 10 coca`) continuam respondendo normalmente — o silenciamento é só para origem voz.
- Alertas de estoque crítico/zerado em tempo real seguem ativos (esses são importantes na hora).
- Wizard de estoque, gerenciamento manual no Admin.

## Arquivos afetados
- `supabase/functions/telegram-webhook/index.ts` — prompt, "Ouvindo…", edit final, flag silent nos handlers de voz.
- `supabase/functions/daily-waiter-report/index.ts` — nova seção de movimentação de estoque do dia.

## Critério de sucesso
1. Áudio "lança um medalhão na mesa 2" → bot mostra `🎤 Ouvindo…` → edita para `🎤 Entendi: lançar 1× Medalhão de Frango na mesa 2 ✅` → o pedido aparece na mesa 2.
2. Áudio "entrada 5 coca" → ainda funciona como reposição de estoque, mas com retorno enxuto (`🎤 Entendi: entrada de 5× Coca ✅`), sem o bloco de Saldo + botão Desfazer.
3. Às 23h59 chega o relatório diário com a nova seção de movimentação de estoque + críticos.

