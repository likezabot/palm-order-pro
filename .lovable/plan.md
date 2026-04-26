
# Auditoria técnica completa — Plano B Espetaria

## ⚠️ Áreas PRESERVADAS (zero alteração)
Não vou tocar em **nada** dos seguintes arquivos / fluxos, mesmo se houver oportunidade de melhoria:

- `src/lib/print-*` (print-jobs, print-queue, print-queue-worker, print-receipt, print-service, print-config, print-iframe, thermal-printer)
- `src/lib/receipt-*`, `receipt-html`, `receipt-layout`, `reprint-senha`, `senha`
- `src/components/admin/PrintConfigPanel.tsx`, `PrinterDiagnostics.tsx`, `StuckPrintsPanel.tsx`
- `src/components/cashier/PrintChoiceDialog.tsx`, `src/components/palm/Print*.tsx`, `src/components/pdv/Print*.tsx`, `src/components/print-station/*`
- `src/hooks/use-print-*.ts`
- `bridge/*`, qualquer coisa Electron/EXE
- Tabela `print_jobs` e payloads de impressão
- Edge functions de impressão (não há nenhuma — confirmado)

A `health-check` **não modifica nada de impressão hoje** (apenas lê e gera warning textual `stuck_print`). Vou manter esse comportamento.

---

## 🔍 FASE 1 + 2 — Problemas encontrados

### 🔴 CRÍTICOS (corrigir)

1. **Loop potencial de log via `console.error`** — `src/lib/error-log.ts`
   - `installGlobalErrorCapture` substitui `console.error` e dispara `logError`. Se algum dia `logError` chamar `console.error` (direta ou indiretamente via React/Sonner), entra em loop.
   - Falta **flag de re-entrância** (`isLogging`) para garantir que log nunca se loga.
   - Já tem dedupe + throttle, mas isso só atenua, não previne. Throttle de 20/min ainda enche o `error_log` rapidamente.

2. **Secret/anon key exposta em fetch direto à edge function** — `ErrorLogPanel.tsx:134-140` e `DailyErrorsPanel.tsx:219-225`
   - Faz `fetch(...)` manual com `Authorization: Bearer ${VITE_SUPABASE_PUBLISHABLE_KEY}` e `?fix=...` na URL.
   - O `VITE_SUPABASE_PUBLISHABLE_KEY` é anon key (público — ok), mas o **padrão correto** é `supabase.functions.invoke("health-check", { body: { fix: "..." } })`, que não vaza o token nas URLs (logs/CORS) e é coerente com o resto do app. Já temos `runHealthCheck` usando `invoke`.
   - Vou trocar por `invoke` e adaptar a edge function para aceitar `fix` no body também (mantendo querystring por compat).

3. **Fluxo health-check não trata erro do PostgREST quando ?fix=function_not_unique falha** — quando a RPC `fix_create_public_order_duplicate` não existe ou retorna erro, o painel mostra erro genérico. Vou padronizar a resposta com `friendly message`.

4. **Painel de erros pode quebrar com `context` malformado** — `ErrorLogPanel.tsx:298` e `DailyErrorsPanel.tsx:423` fazem `JSON.stringify(r.context ?? {}, null, 2)`. Se `context` vier como string (vide nosso próprio `console.error` wrapper que pode passar string), `?? {}` não cobre. `JSON.stringify` aceita string, mas vou blindar tipo + tamanho (truncar contextos absurdos a 20 KB).

5. **`AlertTriangle` importado mas não usado** em `Admin.tsx` (linter warning) — pequeno, mas poluindo.

### 🟠 IMPORTANTES (corrigir)

6. **Falta proteção contra duplo clique em ações administrativas críticas** que **não são impressão**:
   - `Admin.tsx::handleDelete` → confirma e chama RPC, mas se usuário clica 2x rápido, dispara 2 vezes (a primeira mostra `confirm()` que serializa, mas em mobile com debounce ruim ainda é risco).
   - `Admin.tsx::handleToggleActive` → sem `disabled` durante in-flight.
   - `OrdersTab` botões de status — verificar.
   - `CloseOrder.handleConfirm` JÁ tem `if (sending) return` ✅ (mantido).

7. **`PublicCheckout` — submitting permanece `true` em sucesso** (não há `setSubmitting(false)` no caminho feliz). Isso é OK porque navega, mas se a navegação falhar o botão fica travado. Adicionar `finally` defensivo (sem alterar o fluxo de sucesso).

8. **`.single()` em locais onde a linha pode não existir** — vou trocar por `.maybeSingle()` somente nos arquivos seguros (não-impressão):
   - `src/components/admin/online-settings/RestaurantInfoEditor.tsx:39`
   - `src/components/palm/TableGrid.tsx:73`
   - `src/components/palm/MoveTableDialog.tsx:36`
   - `src/components/admin/OnlineSettingsPanel.tsx:16`
   - `src/components/admin/SettingsDialog.tsx:36`
   - `src/hooks/use-palm-cart.ts:50, 75`
   - **NÃO TOCAR**: `src/lib/print-service.ts`, `src/lib/print-config.ts`, `src/lib/reprint-senha.ts` (todos relacionados a impressão).

9. **Captura global instala interceptors em **todo** XHR/fetch** — incluindo `health-check?fix=...` que retorna erro estruturado, gerando duplo log (uma vez pelo `fetch` interceptor com `http_400`, outra pelo handler do painel via `logError`). Já tem `IGNORE_URL_PATTERNS` mas `health-check` não está lá — vou adicionar regra para não duplicar.

10. **Health-check sem proteção por secret** — hoje qualquer um com a anon key chama `?fix=function_not_unique` e dispara mutation no banco via `fix_create_public_order_duplicate`.
    - **Decisão conservadora**: NÃO adicionar `HEALTH_CHECK_SECRET` agora porque (a) o painel admin precisa dele e exporia mais secrets ao frontend, (b) as ações são **idempotentes e auditadas**, (c) a RPC chamada já é restrita ao seu próprio escopo.
    - Vou apenas **documentar como risco residual** no relatório, conforme você pediu.

### 🟡 OBSERVAÇÕES (não corrigir)

- Bridge offline em loop registra `http_0` no error_log a cada 13s (visto nos logs). Isso é parte do monitor de bridge → **não vou tocar** (área proibida). Apenas vou adicionar `localhost:9100` ao `IGNORE_URL_PATTERNS` do interceptor de fetch para parar o ruído no log — *isso não altera o comportamento da bridge nem a UI de status, só evita poluir o `error_log`*. Se preferir manter o ruído como sinal de saúde, me avise.
- Sem auth: o sistema é open-RLS por design (POS interno). Não vou alterar políticas RLS.

---

## 🛠️ FASE 3 + 4 — Lista de arquivos a alterar

Apenas estes (zero arquivos de impressão / bridge / EXE):

1. `src/lib/error-log.ts`
   - Flag de re-entrância anti-loop (`__plbLogging`).
   - Adicionar `localhost:9100`, `/functions/v1/health-check` ao `IGNORE_URL_PATTERNS`.
   - Truncar `context` a ~20 KB antes de inserir.
   - Garantir que `safeStringify` nunca quebre se o objeto tem getters problemáticos.

2. `src/components/admin/ErrorLogPanel.tsx`
   - Trocar `fetch` direto por `supabase.functions.invoke("health-check", { body: { fix: fixKey } })`.
   - Defesa em `JSON.stringify(context)` (try/catch + truncar).
   - `disabled` durante in-flight em `markResolved`.

3. `src/components/admin/DailyErrorsPanel.tsx`
   - Mesma troca de `fetch`→`invoke` para `applyFix`.
   - Defesa em `JSON.stringify(context)`.

4. `supabase/functions/health-check/index.ts`
   - Aceitar `fix` também no JSON body (não só querystring), para suportar `invoke`.
   - Não altera comportamento existente.

5. `src/pages/Admin.tsx`
   - Remover import `AlertTriangle` não usado.

6. `src/hooks/use-palm-cart.ts` — `.single()` → `.maybeSingle()` nos 2 pontos (e tratar `null`).

7. `src/components/palm/TableGrid.tsx` — `.single()` → `.maybeSingle()` (já tem fallback).

8. `src/components/palm/MoveTableDialog.tsx` — `.single()` → `.maybeSingle()`.

9. `src/components/admin/OnlineSettingsPanel.tsx` — `.single()` → `.maybeSingle()`.

10. `src/components/admin/SettingsDialog.tsx` — `.single()` → `.maybeSingle()`.

11. `src/components/admin/online-settings/RestaurantInfoEditor.tsx` — `.single()` → `.maybeSingle()`.

12. `src/pages/PublicCheckout.tsx`
    - Adicionar `finally { setSubmitting(false) }` defensivo apenas se a promise de navegação falhar (sem alterar fluxo feliz).

13. `src/pages/Admin.tsx::handleToggleActive` e `handleDelete`
    - Adicionar guard de in-flight (state local `togglingId` / `deletingId`) para impedir duplo clique.

---

## ❌ Arquivos REMOVIDOS da lista de alteração (impressão/bridge):
`print-service.ts`, `print-config.ts`, `reprint-senha.ts`, `print-queue*.ts`, `print-jobs.ts`, `receipt-*.ts`, `thermal-printer.ts`, `senha.ts`, `PrintConfigPanel.tsx`, `PrinterDiagnostics.tsx`, `StuckPrintsPanel.tsx`, `PrintChoiceDialog.tsx`, `Print*` em palm/pdv/print-station, `use-print-*.ts`, tudo em `bridge/`.

---

## 🧪 FASE 5 — Como testar depois (manual)

1. Abrir `/menu/<slug>` → adicionar item → checkout → confirmar pedido. Não deve duplicar com clique rápido.
2. Pedido aparece no Admin → editar pedidos → status muda corretamente.
3. Cozinha (`/kitchen`) recebe via realtime (sem refresh).
4. Caixa (`/pdv`) → fechar mesa → confirmação não permite duplo clique (já estava).
5. Admin → aba "Erros & Logs" → clicar "Verificar agora" → roda sem expor secret no Network.
6. Auto-corrigir um erro `function_not_unique` (se houver) → não deve mais aparecer `Authorization: Bearer eyJ...` em URL na aba Network.
7. Painel não deve quebrar ao abrir um erro com `context` enorme.
8. Confirmar visualmente que **fila de impressão e bridge continuam idênticos** (`StuckPrintsPanel`, banner do bridge, ícone na sidebar).
9. Console DevTools: nenhum loop de log se você forçar um `console.error` manual repetido.

---

## 📋 Relatório final que entregarei após aplicar
- Resumo dos 13 arquivos alterados.
- Diff comportamental por arquivo.
- Risco residual: health-check sem secret (decisão consciente).
- Confirmação explícita: nada da impressão/bridge/EXE foi tocado.

Aprove para eu aplicar.
