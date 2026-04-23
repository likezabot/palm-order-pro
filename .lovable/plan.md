
# Plano: consertar o bot do Telegram com validação + auto-correção antes de te devolver

## Problema confirmado

O áudio nem entra no fluxo de voz do bot:
- os requests mais recentes para `telegram-webhook` continuam voltando **401**
- não existem logs `[voice ...]`, então o código de “🎤 Ouvindo…” nem está sendo alcançado
- o `telegram-webhook` hoje exige o header `X-Telegram-Bot-Api-Secret-Token` bater com `WEBHOOK_SECRET`

Conclusão: o problema real agora não é Palm/Admin/preview. O webhook do Telegram está registrado **sem o secret atual** ou com **secret diferente** do que a função espera. Por isso o update é barrado antes de processar texto/voz.

## O que vou implementar

### 1. Diagnóstico programático do webhook
Adicionar no backend do bot um bloco de diagnóstico que consulte o Telegram com `getWebhookInfo` e compare:
- URL atual registrada
- se existe erro pendente no Telegram
- se o endpoint esperado é o `telegram-webhook` atual
- se o projeto tem `WEBHOOK_SECRET` configurado

Resultado: consigo saber exatamente se o problema é:
- URL errada
- secret ausente
- secret divergente
- webhook quebrado no Telegram

### 2. Auto-correção do webhook
Adicionar uma rotina de reparo que faça `setWebhook` com:
- a URL correta do `telegram-webhook`
- o `secret_token` igual ao `WEBHOOK_SECRET` atual

Isso corrige o cenário em que o bot foi redeployado, mas o Telegram ficou apontando para configuração antiga.

### 3. Método fechado de validação e reteste
Vou criar um fluxo obrigatório de validação, para não te entregar “talvez funcionando”:

```text
validar estado atual
→ se inválido: reparar webhook
→ validar novamente
→ rodar smoke test interno
→ validar logs HTTP
→ só então considerar corrigido
```

Se qualquer etapa falhar:
- o processo volta para a etapa de reparo
- refaço o teste
- não considero concluído até passar

### 4. Smoke test interno no próprio bot
Aproveitar o `TEST_MODE` que já existe no `telegram-webhook` para criar/verificar testes de fumaça controlados:
- texto simples
- comando com mesa
- fluxo de voz simulado
- captura da resposta do bot sem imprimir e sem depender do app

Objetivo: provar no backend que o handler responde corretamente antes do teste real no Telegram.

### 5. Critério de aceite real
Só vou considerar resolvido quando os 3 sinais baterem juntos:
1. requests do `telegram-webhook` pararem de retornar **401**
2. logs passarem a mostrar entrada real no fluxo de voz (`[voice ...] received`)
3. um áudio/comando real voltar com resposta do bot (`🎤 Ouvindo…`, confirmação ou execução)

## Arquivos que entram no ajuste

- `supabase/functions/telegram-webhook/index.ts`
- `supabase/functions/telegram-webhook/security_test.ts`
- possivelmente um teste novo para saúde/reparo do webhook no diretório `supabase/functions/telegram-webhook/`

## O que NÃO vou mexer

- frontend React
- Admin / Palm / Kitchen / PDV
- animações
- impressão
- bridge local
- telas do app

## Resultado esperado

Depois da correção:
- o Telegram volta a entregar updates ao bot
- áudio volta a mostrar resposta imediata
- o sistema passa a ter um processo repetível de **validar → corrigir → validar de novo**
- se a correção não passar no teste, eu volto e refaço antes de te devolver
