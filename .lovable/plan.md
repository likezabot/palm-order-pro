

# Manter estoque, remover só "trava de esgotado" + adicionar comando de voz "acabou X"

## Decisão

Não removo mais nada do sistema de estoque. Mantenho:
- Página `/estoque`, card no Home, comandos do bot (entrada/saída/ajuste/consulta), wizard, voz pra estoque, tabelas no banco.

Removo só a **fricção visual/trava** de "esgotado" no PALM **e adiciono um atalho de voz natural** pra marcar item como esgotado.

## O que muda

### 1. PALM — sem trava de esgotado

- `MenuView.tsx`: tirar o `EsgotadoConfirmDialog` do fluxo. Adicionar segue direto, sem popup. **Mantém** a tarja visual "ESGOTADO" no card (badge/overlay) pra informar — só não bloqueia mais.
- `GroupVariantDialog.tsx`: linhas esgotadas continuam mostrando a tarja, mas ficam **clicáveis** (sem `disabled`, sem bloquear o stepper).
- `EsgotadoConfirmDialog.tsx`: **apagar** (não usado em mais lugar nenhum).
- `useProductStockMap` + `useProductRecipes` + `isProductEsgotado`: **mantidos** — continuam alimentando a tarja visual.

### 2. Bot Telegram — comando natural "acabou X"

Adicionar no parser de texto e voz uma intent nova `STOCK_OUT_NOW` que:
- Detecta padrões: `acabou <item>`, `acabou o <item>`, `acabou a <item>`, `não tem mais <item>`, `terminou <item>`, `zerou <item>`, `sem <item>`.
- Resolve o item via `find_inventory_item_by_text` (RPC já existente, faz match por slug/aliases sem acento).
- Chama `apply_inventory_movement(item_id, 'adjustment', 0, 'Marcado como esgotado via bot', 'telegram')` — força `current_stock = 0`.
- Responde: `✅ Marquei "<nome>" como esgotado (estoque = 0). PALM já mostra a tarja.`
- Se não achar o item: `❓ Não achei "<termo>" no estoque. Tente "lista estoque" pra ver os nomes.`

### 3. Confiança da voz (híbrido)

`STOCK_OUT_NOW` é **baixo risco** (zera 1 item, reversível com "entrada"), então **executa direto** via voz, sem botão de confirmar. Continua confirmando só `STOCK_MOVEMENT` (entrada/saída/ajuste com quantidade explícita).

### 4. System prompt da transcrição

Pequeno ajuste no prompt do `transcribeTelegramVoice` pra preservar verbos no passado ("acabou", "terminou", "zerou") em vez de normalizar pra infinitivo.

## Arquivos editados

- `src/components/palm/MenuView.tsx` — remove dialog/state de esgotadoPending, adiciona direto.
- `src/components/palm/GroupVariantDialog.tsx` — destrava linha esgotada.
- `src/components/palm/EsgotadoConfirmDialog.tsx` — **deletar**.
- `supabase/functions/telegram-webhook/index.ts` — nova intent `STOCK_OUT_NOW`, parser regex, handler, ajuste no prompt da voz.
- `.lovable/memory/features/telegram-bot.md` — documentar comando "acabou X".

## O que NÃO muda

- Tarja visual ESGOTADO nos cards/linhas (continua aparecendo, baseada no stockMap + recipes).
- Página /estoque, hooks de inventory, todos os outros comandos do bot, tabelas, RPCs, triggers.
- Lógica de pedidos.

## Validação

1. PALM: produto com estoque 0 mostra tarja vermelha "ESGOTADO", mas tap adiciona ao carrinho normalmente (sem popup).
2. Bot texto: enviar `acabou medalhão` → responde `✅ Marquei "Medalhão" como esgotado`. Estoque vai pra 0.
3. Bot voz: falar "acabou o medalhão" → mesma resposta direta, sem botão de confirmar.
4. Bot: enviar `acabou xpto inexistente` → resposta de "não achei".
5. PALM atualiza tarja em segundos (via realtime do stockMap query).
6. `entrada 5 medalhão` continua funcionando e tira da condição esgotada.

