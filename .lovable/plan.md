

# IA conversacional: confirmação por linha + executar o que é óbvio

## O que está acontecendo hoje (e o que vou corrigir)

Pela imagem você mandou um áudio com 3 frases:
1. "qual o valor da mesa 2"
2. "lança um pedido de 2 bovino na mesa 3"
3. "faz o pedido de uma coca-cola 1l vidro (somente local) na mesa 6"

O bot respondeu **`✅ Pronto:`** com só 2 bullets — o item 1 (consulta) executou e mostrou `R$ 20,00`, o item 2 lançou Bovino, mas o item 3 falhou silenciosamente (a coca não foi reconhecida porque o nome no cardápio provavelmente não casa com "coca-cola 1l vidro somente local"). Você quer:

- Cada linha com seu próprio status `✅ / ❌ / ❓`
- Se algo ficou ambíguo/parcial, botão de confirmar/corrigir **POR LINHA** dentro da mesma mensagem
- O óbvio (`mesa 2 +2 bovino`) executa direto — só aparece o `↩️ Desfazer`
- Múltiplos comandos em mesas diferentes funcionam de verdade

Sim, é totalmente viável. O bot já tem confiança por linha — só falta tratar as linhas individualmente em vez de tudo-ou-nada.

## Mudanças em `supabase/functions/telegram-webhook/index.ts`

### 1. Status real por linha (em vez de assumir sucesso)
Hoje o multi-comando monta bullets a partir de `previewParts` (que é só o **plano**, não o **resultado**). Por isso a coca sumiu da mensagem — ela falhou no batch mas o bullet usou o preview otimista.

Vou trocar para: cada linha carrega seu próprio resultado depois da execução, com um dos 4 estados:
- `✅` executado — `🍽️ Lancei: mesa 3 +2 Bovino`
- `👀` consulta — `Mesa 2: R$ 20,00 (2 itens)`
- `❓` ambíguo / produto não encontrado — `❓ Mesa 6: "coca-cola 1l vidro" — escolha:` + botões inline
- `❌` erro real — `❌ Mesa X: <motivo>`

A mensagem final fica:
```
🎤 Ouvi: "qual o valor da mesa 2 / lança 2 bovino na mesa 3 / coca 1l vidro mesa 6"

✅ Pronto:
👀 Mesa 2: R$ 20,00 (2 itens)
🍽️ Lancei: mesa 3 +2 Bovino
❓ Mesa 6: "coca-cola 1l vidro" — qual?
   [Coca-Cola 1L Vidro]  [Coca-Cola Lata]  [Cancelar esta]
```

### 2. Confirmação por linha (não tudo-ou-nada)
Hoje o `voice_confirm` tem 2 botões só (✅ Executar tudo / ❌ Cancelar tudo). Vou substituir por **um conjunto de botões por linha duvidosa**, no formato:

```
🎤 Ouvi: "..."
🧾 Plano:
1. ✅ mesa 2: consultar valor   (auto, óbvio)
2. ✅ mesa 3 +2 Bovino           (auto, óbvio)
3. ❓ mesa 6: "coca 1l vidro"    [escolha abaixo]

[ Coca-Cola 1L ] [ Coca Lata ]
[ ❌ Pular linha 3 ]
[ ▶️ Executar tudo ]
```

Cada botão tem callback dedicado: `vl|pick|<token>|<lineIdx>|<productId>` e `vl|skip|<token>|<lineIdx>`. Quando você clica numa opção, o bot **edita a mesma mensagem** marcando a linha como resolvida (`✅ mesa 6 +1 Coca-Cola 1L`) e mantém as outras pendentes. Quando todas resolvidas (ou puladas), executa de uma vez com Desfazer agrupado por mesa.

State no `telegram_chat_state` (step `voice_resolve`) guarda: `{ token, lines: [{idx, status, planned, options?, chosenProductId?}], transcript, waiter }`. TTL 5 min.

### 3. Linhas óbvias executam direto, ambíguas pedem confirmação
Regra de "óbvio" por linha (já temos os sinais via `enriched`):
- Comando ADD/REMOVE com `productResolution === "found"` + qty ≤ 4 + mesa explícita → **auto-executa**
- Consulta (VIEW / TABLE_VALUE / STOCK_QUERY) → **auto-executa** (não tem efeito colateral)
- STOCK_MOVEMENT com item resolvido → **auto-executa**
- Qualquer linha com `ambiguous` ou `not_found` → vira card de escolha por linha
- Mesa via contexto + qty ≥ 5 → pede confirmação só dessa linha

Resultado: você manda 5 comandos, 4 são óbvios e executam direto, só 1 fica esperando seu toque. Hoje basta UMA linha duvidosa pra travar tudo.

### 4. Botão "↩️ Desfazer" agrupado (não muda o atual, só consolida)
Quando vários ADDs auto-executam em mesas diferentes, o footer da mensagem ganha **um botão de Desfazer por mesa afetada**, na própria mensagem (sem mensagens extras):
```
[↩️ Desfazer mesa 3]  [↩️ Desfazer mesa 6]
```
Token de undo expira em 60s como hoje.

### 5. Prompt do Gemini reforçado para preservar variantes
A "coca-cola 1l vidro (somente local)" é difícil porque o Gemini pode estar normalizando demais. Vou acrescentar ao prompt:
> "Preserve qualificadores de produto: tamanho (1l, 600ml, 350ml), embalagem (vidro, lata, pet), variante (zero, diet, tradicional). NÃO remova parênteses do usuário — deixa entre aspas se for instrução tipo 'somente local'."

E o `resolveProduct` (fuzzy) já pondera apelidos — mas vou conferir se "1l vidro" está nos `aliases` da Coca-Cola no banco. Se não estiver, o card de escolha vai aparecer corretamente em vez de sumir.

### 6. Mensagem "Pronto" fala a verdade
Renomeio o cabeçalho conforme o que efetivamente aconteceu:
- Tudo executado → `✅ Pronto:`
- Algo pendente de escolha → `🤔 Quase pronto — preciso de 1 escolha:`
- Algo falhou de verdade → `⚠️ Parcial:` (lista o que deu certo + o que falhou)

## O que NÃO muda
- Indicador `🎤 Ouvindo…` que edita a própria mensagem.
- Verbos `🍽️ Lancei` / `🗑️ Removi` / `📦 Atualizei estoque` / `👀 Consulta`.
- Whitelist, binding de garçom, vínculo de mesa por contexto.
- Comandos por texto, impressão, kanban, cardápio, apelidos.
- Relatório diário 23h59 com balanço de estoque.

## Arquivos afetados
- `supabase/functions/telegram-webhook/index.ts` — nova máquina de estado `voice_resolve` por linha, callbacks `vl|pick|...` / `vl|skip|...` / `vl|run|...`, refator do bloco multi-comando para coletar resultado real por linha, prompt Gemini.
- `supabase/functions/telegram-webhook/parser_test.ts` — testes para o novo fluxo de "linha óbvia vs ambígua" e payload do state `voice_resolve`.

## Critério de sucesso
1. Áudio do print (3 comandos misturados) → mensagem única com 3 bullets, item 3 com botões `[Coca 1L Vidro] [Coca Lata] [Pular]`. Clico numa opção → bot edita marcando ✅ e executa.
2. Áudio "mesa 2 mais 2 bovino" → executa direto, mensagem final tem só `🍽️ Lancei: mesa 2 +2 Bovino` + `[↩️ Desfazer mesa 2]`.
3. Áudio "lança 1 medalhão na mesa 3, tira 1 coca da mesa 5, qual o valor da mesa 2" → 3 bullets executados, sem confirmação, com 2 botões de Desfazer (mesa 3 e mesa 5).
4. Se eu não confirmar a linha pendente em 5 min, state expira e a mensagem é editada para `⏱ Confirmação expirada` (linhas já executadas permanecem).

