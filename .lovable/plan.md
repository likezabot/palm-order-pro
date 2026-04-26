
# Plano: log automático de TODO erro + verificação e correção automáticas

Objetivo: garantir que **nenhum erro escape** do repositório `error_log` e adicionar uma camada de **diagnóstico + auto-correção** rodando sozinha, sem precisar de intervenção manual.

---

## 1. Captura global de erros (frontend) — automática

Hoje o `logError()` existe mas só é chamado manualmente em `PublicCheckout.tsx`. Vou ligar 4 "redes de captura" globais em `src/main.tsx` para que **qualquer** erro caia no repositório:

1. **`window.onerror`** → erros JS não tratados (TypeError, ReferenceError…).
2. **`window.onunhandledrejection`** → Promises rejeitadas sem `.catch`.
3. **Wrapper do `console.error`** → mantém o comportamento original e envia ao log.
4. **Interceptor do `supabase` client** → wrapper fino em volta de `.from()`/`.rpc()` que loga toda resposta com `error` (RPC ambígua, RLS, validação, etc.).

Cada captura inclui automaticamente: rota, user-agent, viewport, stack truncada, timestamp.

Anti-spam:
- Buffer em memória com **dedupe** por `source+code+message` numa janela de 30s.
- Throttle de no máx. 20 inserts/min para não inundar a tabela em loop de erro.

## 2. Logging nos `catch` críticos existentes

Adicionar `logError()` dentro dos `catch` que hoje só fazem `toast`:
- `src/pages/Pdv.tsx` (handleAdvance, payment, etc.)
- `src/pages/Cashier.tsx`
- `src/pages/PublicMyOrders.tsx`
- `src/components/palm/OrderReview.tsx` (envio de pedido do garçom)
- `src/components/cashier/CloseOrder.tsx`
- `src/components/admin/PublicMenuCustomizer.tsx` (vários catch)
- `src/lib/global-order-runtime.ts`, `src/lib/print-queue-worker.ts`, `src/lib/print-service.ts` (impressão — só LOG, sem mexer na lógica)

Cada um com `source` apropriado (`pdv`, `palm`, `print`, `realtime`…).

## 3. Captura de erros do backend — edge function `health-check`

Nova edge function **`health-check`** (não toca nas existentes) que, a cada execução:

1. **Valida o schema crítico**:
   - `pg_proc`: `create_public_order` deve existir **exatamente 1 vez** (evita reincidência do bug das duas RPCs).
   - `update_order_status` e `pay_order` presentes.
   - Tabela `error_log` acessível.
2. **Valida estado operacional**:
   - Pedidos `new`/`preparing` parados há > 60 min → loga `warning` (`stale_order`).
   - `print_jobs` com `status='queued'` há > 10 min → loga `warning` (`stuck_print`).
   - `orders` com `status='paid'` mas `served_at IS NULL` → loga `info` (`paid_without_served_at`).
3. **Auto-correções seguras** (idempotentes, nunca tocam em pagamento/impressão real):
   - `paid_without_served_at` → preencher `served_at = updated_at`.
   - `error_log` com mais de 14 dias → deletar.
   - Resolver automaticamente registros de `error_log` cujo `code` pertence a uma **lista branca de auto-resolve** (ex.: `network`, `timeout` quando não reincidente nas últimas 2h).
4. Toda execução grava um resumo em `error_log` com `severity='info'` e `source='other'`, code `health_check_summary`.

Bug das **2 funções `create_public_order`**: se voltar a aparecer, o health-check loga `severity='error'` com code `function_not_unique` e a UI do Admin mostra um botão "Aplicar correção" que dispara um endpoint da própria edge function para fazer o `DROP` da duplicata.

## 4. Cron — verificação automática a cada 5 min

Habilitar `pg_cron` + `pg_net` e agendar `health-check` a cada 5 minutos via `cron.schedule`. Sem dependência de janela aberta no navegador.

## 5. Painel "Erros do sistema" reforçado

Atualizar `src/components/admin/ErrorLogPanel.tsx`:
- **Banner de saúde**: lê o último `health_check_summary` e mostra "Sistema saudável ✓" ou "X alertas detectados".
- **Botão "Rodar verificação agora"** → chama a edge function `health-check` sob demanda.
- **Botão "Auto-corrigir"** por linha quando o `code` está na lista branca (ex.: `function_not_unique`, `paid_without_served_at`).
- Agrupamento por `code` com contagem 24h / 7d.
- Filtro extra por **severity** (error / warning / info).

## 6. Critérios de aceite

1. Provocar um erro JS qualquer no console → aparece em `error_log` em < 5s.
2. Uma RPC falhar → loga automaticamente com o code real.
3. Edge `health-check` roda a cada 5 min e grava resumo.
4. Se as 2 `create_public_order` reaparecerem, o painel mostra alerta + botão de correção, e o checkout volta a funcionar após clicar.
5. Painel mostra banner verde quando tudo está saudável.
6. Build/typecheck limpos.

## 🚫 Fora de escopo (intocável)

- `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/bridge/*`, `electron/*`, `.exe`
- Lógica real de impressão (`print_jobs`, fila, RPCs de impressão) — **só loga**, nunca altera fluxo
- PDV/Cozinha/Palm a nível de comportamento — só adiciona `logError()` nos catch existentes
