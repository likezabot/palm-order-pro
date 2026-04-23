

# Refino completo: testes, performance, segurança

Você quer 4 coisas: (1) rede de testes que impeça quebra em futuras mudanças, (2) performance no front, (3) auditoria de segurança como rotina, (4) o `telegram-webhook` (que virou um arquivo de 5000 linhas) protegido por testes específicos dos fluxos novos.

## 1. Camada de testes — frontend

Hoje existem 14 testes só de funções puras em `src/lib/__tests__` (cart, payment, senha, receipt-layout). Falta cobrir o **comportamento dos componentes** e dos **hooks críticos** que, se quebrarem, derrubam o garçom/cozinha/caixa em produção.

**Novos testes a adicionar** (Vitest + Testing Library, já configurados):
- `src/hooks/__tests__/use-palm-cart.test.ts` — adicionar/remover/alterar qty, subtotal, persistência por mesa.
- `src/hooks/__tests__/use-print-queue.test.ts` — enfileirar, retry, marcar como impresso, idempotência.
- `src/hooks/__tests__/use-product-stock-map.test.ts` — mapeamento produto↔estoque, item esgotado.
- `src/hooks/__tests__/use-pdv-realtime.test.ts` — recebe inserts/updates do Supabase, deduplica.
- `src/components/palm/__tests__/MenuView.test.tsx` — render do cardápio, busca, item oculto não aparece.
- `src/components/palm/__tests__/OrderReview.test.tsx` — totalizador, botão de envio, estado vazio.
- `src/components/kitchen/__tests__/KanbanCard.test.tsx` — transição de status, tempo decorrido.
- `src/components/cashier/__tests__/CloseOrder.test.tsx` — cálculo de troco, validação de pagamento.
- `src/lib/__tests__/print-queue.test.ts` — fila com falha, dedupe, ordem.
- `src/lib/__tests__/inventory.test.ts` — entrada/saída/ajuste, saldo, crítico.
- `src/lib/__tests__/global-order-runtime.test.ts` — agregação de ordem, racing condition.

**Mocks**: `src/test/mocks/supabase.ts` — mock estável de `@/integrations/supabase/client` (auth, from, channel, realtime) reutilizável em todos os testes de componente.

**Smoke test E2E light**: `src/test/smoke.test.tsx` — renderiza `App.tsx` com MemoryRouter para cada rota (`/`, `/palm`, `/kitchen`, `/cashier`, `/admin`, `/stock`, `/pdv`, `/print-station`) e garante que **não joga erro**. Pega 90% das quebras de import/render numa única roda.

## 2. Camada de testes — `telegram-webhook` (Deno)

Hoje só existe `parser_test.ts` (61 testes do parser). Os fluxos novos (auto-execução de óbvio, picker por linha, undo identificado, multi-mensagem) não têm rede de proteção — qualquer mexida no arquivo de 5000 linhas pode quebrar silenciosamente.

**Novos arquivos de teste** em `supabase/functions/telegram-webhook/`:
- `voice_confidence_test.ts` — `assessVoiceConfidence` e `isObviousLine`: linha óbvia executa, ambígua segura, qty alta + contexto pede confirmação.
- `voice_verb_test.ts` — `voiceVerb(kind)` retorna o emoji/palavra certa para ADD/REMOVE/STOCK_MOVEMENT/VIEW/TABLE_VALUE.
- `undo_keyboard_test.ts` — `buildUndoBatchKeyboard(token, tableLabel?)` gera label correto com e sem mesa.
- `fuzzy_resolver_test.ts` — `fuzzyFindProducts` com apelidos: exato > startsWith > tokens > Levenshtein, ambíguo retorna candidatos.
- `state_machine_test.ts` — wizard de estoque: transições entre `awaiting_item → awaiting_qty → awaiting_review`, expiração de TTL.
- `multi_command_render_test.ts` — dado um array de `slotResults`, monta as N mensagens separadas com header dinâmico (`✅ 4/4` vs `⚠️ 3/4`).

Roda via `supabase--test_edge_functions` (que já existe). Antes de qualquer deploy futuro do webhook, esses testes precisam passar.

**Refator preventivo** (sem mudar comportamento): extrair do `index.ts` (4997 linhas) 3 módulos puros para facilitar teste:
- `parser.ts` — parseCommand + regex
- `voice.ts` — assessVoiceConfidence, voiceVerb, isObviousLine, render multi-mensagem
- `keyboards.ts` — buildUndoBatchKeyboard, picker buttons

`index.ts` vira só HTTP handler + orquestração. Não muda nenhum fluxo, só fica testável e legível.

## 3. Performance no front

Sem mexer no design/animações, são ganhos mecânicos:

- **Code splitting por rota**: `App.tsx` hoje importa todas as páginas estaticamente. Mudar para `React.lazy` + `Suspense` em Admin, Stock, PrintStation, Pdv, Cashier (rotas pesadas que não são abertas ao mesmo tempo). Garçom carrega só Palm.
- **`React.memo` nos hot paths**: `KanbanCard`, `OrderRow`, `StockCard`, `CartItemRow`, `SortableProductCard` — re-renderizam em cascata quando o realtime do Supabase dispara. Memoizar com comparação por id+updated_at.
- **Virtualização**: `MenuView` (cardápio), `StockList`, `OrdersTab` se passarem de 50 itens → `@tanstack/react-virtual` (já no ecossistema, leve).
- **Debounce de busca**: campos de busca em Admin/Stock com debounce 200ms (hoje filtram a cada tecla).
- **Realtime mais cirúrgico**: alguns subscriptions hoje escutam `event: '*'` na tabela inteira; trocar por `event: 'INSERT'` ou filtros de coluna específicos onde dá.
- **Bundle**: `vite.config.ts` ganha `manualChunks` separando `recharts`, `@dnd-kit`, `radix-ui` em chunks próprios (cache mais estável entre deploys).
- **Service worker**: revisar `public/sw.js` para não cachear `/functions/*` (já cacheia mais do que devia, segundo o tamanho).

**Métrica de antes/depois**: rodar `npm run build` antes e depois e comparar tamanho dos chunks; rodar Lighthouse local em `/palm` e `/kitchen`.

## 4. Auditoria de segurança contínua

**Ação imediata** (uma vez):
- `security--run_security_scan` — varredura completa de RLS, secrets, endpoints expostos.
- `supabase--linter` — pega RLS desabilitado, policies permissivas demais.
- Revisar `telegram-webhook` quanto a injeção via `text` do usuário (parâmetros indo pra DB), uso correto da whitelist `telegram_allowed_chats`, e logs que **não** vazem `chat_id` em produção sem mascarar.

**Rotina** (documentada no README + memória do projeto):
> Antes de cada commit que toca `supabase/functions/*`, `supabase/migrations/*` ou hooks de auth: rodar `security--run_security_scan` e `supabase--linter`. Se aparecer `error`, bloquear o deploy.

Adicionar `.lovable/memory/preferences/security.md` com essa regra para que toda iteração futura passe pelo crivo automaticamente.

## 5. CI local via script (opcional, mas recomendado)

Criar `scripts/check.sh` que roda em sequência:
1. `npm run lint`
2. `npm test`
3. `deno test supabase/functions/telegram-webhook/*_test.ts`
4. `npm run build`

Antes de qualquer mudança grande, esse script tem que passar 100%. Se um teste novo falhar, sabemos exatamente o que quebrou.

## Ordem de execução proposta

1. **Refator preventivo do telegram-webhook** (extrair 3 módulos, sem mudar comportamento) + testes Deno cobrindo eles.
2. **Mocks de Supabase** + testes de hooks críticos + smoke test de rotas.
3. **Performance**: lazy loading de rotas, memo nos hot paths, manualChunks.
4. **Scan de segurança** + correções de findings que aparecerem.
5. **Documentar a rotina** (memória + README).

## O que NÃO muda
- Design, cores, animações, layout, fontes.
- Comportamento do garçom, cozinha, caixa, admin, estoque.
- Fluxo de impressão (acabamos de estabilizar — não toca).
- Telegram bot UX (verbos, undo identificado, picker por linha — tudo permanece).

## Arquivos afetados (resumo)
- **Novos**: ~10 arquivos de teste em `src/`, ~6 em `supabase/functions/telegram-webhook/`, `src/test/mocks/supabase.ts`, `src/test/smoke.test.tsx`, `scripts/check.sh`, `.lovable/memory/preferences/security.md`.
- **Refatorados**: `App.tsx` (lazy routes), `vite.config.ts` (manualChunks), `telegram-webhook/index.ts` (extrair módulos), 5-6 componentes (memo), `public/sw.js` (cache).
- **Sem mudança funcional visível** para o usuário final.

## Critério de sucesso
1. `npm test` roda 40+ testes e passa.
2. `deno test` no telegram-webhook roda 100+ testes e passa.
3. `security--run_security_scan` retorna sem `error` e sem `warn` crítico.
4. Bundle JS inicial cai pelo menos 30% (lazy routes).
5. `MenuView`, `KanbanCard`, `OrderRow` não re-renderizam quando dados não mudam (verificável por teste).
6. Próxima alteração que quebrar fluxo crítico é pega por teste **antes** do deploy.

