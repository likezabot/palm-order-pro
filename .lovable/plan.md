

# Plano: destravar `telegram-webhook` (401 no gateway)

## Diagnóstico

Logs do edge runtime confirmam:
- Você mandou comando agora há pouco → Telegram fez `POST /functions/v1/telegram-webhook` → **resposta 401** (`status_code:401` em `1.776968026927e+15`).
- Antes desse 401, **só** existem chamadas a `notify-telegram` (saídas, status 200). Nenhuma entrada do Telegram chegou ao handler nas últimas horas.
- A função `telegram-webhook` está bootando normalmente (logs `booted (time: 29ms)`), ou seja, o código está OK. O 401 vem **antes** do handler — é o gateway de Edge Functions exigindo JWT.
- `supabase/config.toml` já tem `[functions.telegram-webhook] verify_jwt = false`, mas o último deploy não aplicou esse flag no gateway (acontece quando o deploy é parcial ou quando outra mudança no projeto rodou antes do config virar efetivo).

Conclusão: nada foi “quebrado” no código da limpeza anterior (mexi só em `App.tsx` e `main.tsx`, fora do escopo do bot). O que precisa é **forçar um redeploy da `telegram-webhook`** para o gateway reler o `verify_jwt = false`.

## Correção (1 ação, 0 mudança de código)

### Passo único — Redeploy forçado de `telegram-webhook`

Usar `supabase--deploy_edge_functions` com `function_names: ["telegram-webhook"]`.

Isso:
- Republica a função com o `config.toml` atual (que já tem `verify_jwt = false`).
- O gateway passa a aceitar o POST do Telegram sem JWT.
- O bot volta a responder a comandos de texto e voz imediatamente.

## Validação pós-deploy

1. Mandar de novo um comando simples no Telegram (ex.: `mesa 1`).
2. Reler os logs com `analytics_query` filtrando `pathname like '%telegram-webhook%'` — esperado `status_code: 200`.
3. Se ainda vier 401, abrir `edge_function_logs` da `telegram-webhook` e olhar mensagens de erro pós-boot.

## O que NÃO será mexido

- `supabase/functions/telegram-webhook/index.ts` (5069 linhas — está íntegro).
- `supabase/config.toml` (já correto).
- Frontend (`App.tsx`, `main.tsx`, `AdminErrorBoundary.tsx`).
- Qualquer outra função (`notify-telegram` está respondendo 200, sem ação).
- Whitelist `telegram_allowed_chats`, bindings de usuário, vocabulário do menu — nada disso muda.

## Resultado esperado

Bot volta a responder em <1s após o redeploy. Sem perda de estado, sem mudança de comportamento, sem risco para PDV/Palm/Kitchen/impressão.

