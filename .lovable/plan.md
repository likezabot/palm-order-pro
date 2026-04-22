

## Corrigir inconsistência entre web e PWA instalado

### Causa raiz
O Service Worker (`public/sw.js`) faz **stale-while-revalidate em todas as chamadas REST do Supabase** (`/rest/v1/*`). No PWA instalado, isso significa que cada request de pedidos/produtos/settings devolve **primeiro a resposta cacheada da última visita** e só depois atualiza em background. Combinado com a persistência do React Query no IndexedDB (`query-persister.ts`, com `staleTime: 60s` e `maxAge: 24h`), o app instalado fica preso em **dois níveis de cache antigo**:

1. SW devolve JSON velho do Supabase.
2. React Query reidrata estado antigo do IndexedDB e ainda confia nele por 60s.

Resultado: totais errados, categorias embaralhadas, mesa fechada continua aparecendo, alterações do admin não refletem. O PDV funciona porque está aberto via navegador (sem SW instalado de forma persistente como acontece no PWA Android).

Bonus: `vite.config.ts` injeta `__APP_VERSION__ = new Date().toISOString()` no bundle, mas como o próprio JS antigo continua sendo servido pelo SW velho, o `buster` do persister nunca dispara → cache nunca invalida sozinho no celular.

### Correção estrutural

**1. `public/sw.js` — parar de cachear API do Supabase**
- Remover completamente o branch `staleWhileRevalidate` para `*.supabase.co/rest/v1/*`.
- Remover `API_CACHE_NAME` e a função `staleWhileRevalidate`.
- Toda chamada REST passa direto pra rede. Offline parcial continua coberto pelo persister do React Query (IndexedDB) que já tem `networkMode: "offlineFirst"`.
- Manter cache só de assets estáticos (`/manifest.json`, ícones) com cache-first.
- Manter HTML como network-first com `no-store` (já está correto).
- Adicionar limpeza ativa no `activate` que apaga **qualquer cache `plano-b-api-*`** legado, garantindo que celulares com versão antiga limpem na próxima atualização.

**2. `public/sw.js` — forçar atualização agressiva do próprio SW**
- Já tem `BUILD_STAMP` injetado no build via `vite.config.ts`. Manter.
- Servir o `sw.js` com `Cache-Control: no-cache` no fetch handler quando navegador pedir o próprio script (browsers já fazem isso por padrão desde 2022, mas garantimos ignorando o cache HTTP em `register("/sw.js", { updateViaCache: "none" })` em `src/main.tsx`).

**3. `src/main.tsx` — `updateViaCache: "none"` no register**
- Trocar `register("/sw.js")` por `register("/sw.js", { updateViaCache: "none" })`. Garante que toda checagem de update busca o SW direto da rede, ignorando HTTP cache. Sem isso, alguns Androids cacheiam o `sw.js` por 24h e o app fica preso na versão antiga mesmo após deploy.

**4. `src/lib/version-check.ts` — buster baseado no build stamp do SW**
- Hoje o version-check usa `__APP_VERSION__` que vem do bundle JS. Se o SW serve JS antigo, esse valor nunca muda no celular.
- Trocar a fonte: ler o `BUILD_STAMP` direto do `/sw.js` via `fetch("/sw.js?cache=no", { cache: "no-store" })` na inicialização e extrair o stamp por regex. Como o SW é sempre buscado da rede agora (passo 3), esse stamp é o mais novo possível. Se diferir do armazenado em `localStorage`, dispara o cleanup + reload (lógica atual já faz isso, só trocamos a fonte da versão).

**5. `src/App.tsx` — buster do persister também usa o stamp do SW**
- Mesmo princípio: importar `getAppVersion()` atualizado para devolver o stamp lido em (4), fazendo o React Query persister invalidar o IndexedDB sempre que houver deploy novo.

**6. Reduzir `staleTime` da query de pedidos ativos no PWA**
- Em `src/hooks/use-pdv-realtime.ts` e onde estiver `["active-orders"]`, deixar `staleTime: 0` (já temos Realtime cobrindo; persister mantém `placeholderData` pra UX). Isso garante que a primeira request após reidratação valida com a rede em vez de confiar no cache 60s.

### Sobre cálculo de totais
Revisei `use-palm-cart.ts` e `payment.ts`. A fórmula é única:

```ts
total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
```

Não há divergência de lógica entre web e PWA. **Os "valores errados" relatados são consequência do cache stale** — o app exibe a soma de um cart/order antigo. Ao corrigir o cache (passos 1-6), o cálculo passa a refletir o estado real automaticamente. **Nenhuma mudança na lógica de cálculo é necessária.**

### Arquivos alterados
- `public/sw.js` — remove cache de API Supabase, limpa caches legados no activate.
- `src/main.tsx` — `register` com `updateViaCache: "none"`.
- `src/lib/version-check.ts` — lê stamp do `/sw.js` em vez de `__APP_VERSION__` do bundle.
- `src/App.tsx` — buster do persister usa o stamp lido (await leve, sem bloquear render).
- `src/hooks/use-pdv-realtime.ts` (e similares) — `staleTime: 0` para `active-orders` (Realtime + persister cobrem UX).

### Como o celular instalado vai atualizar
- **Imediato (dispositivos já travados)**: na próxima abertura, o SW antigo ainda serve cache velho 1 vez. O novo `version-check` vai detectar (via fetch direto do `/sw.js`) que o stamp mudou, limpar todos os caches + IndexedDB do React Query, desregistrar SW antigo e recarregar. A partir daí, o novo SW (sem cache de API) assume.
- **Permanente**: nenhuma chamada REST passa mais pelo cache do SW. Toda resposta vem do Supabase em tempo real. Combinado com Realtime + invalidação otimista (já existente), web e PWA mostram exatamente o mesmo estado.

### O que NÃO muda
- Lógica de carrinho, totais, pagamentos, impressão, RLS, edge functions.
- Estratégia de Realtime, persister do React Query, otimismo no fechamento de mesa.
- Comportamento no PDV (que já está correto).

