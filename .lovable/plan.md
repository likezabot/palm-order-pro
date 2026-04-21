

## Navegação instantânea + cache offline persistente

### Problema
- React Query mantém cache em memória (já com `networkMode: "offlineFirst"`), mas ao recarregar/perder rede o cache evapora.
- Service Worker atual (`public/sw.js`) faz **network-first** em tudo same-origin → chamadas ao Supabase nem passam por ele (cross-origin), e nada de dados fica disponível offline.
- Ao voltar do Menu para a TableGrid, o componente remonta e re-fetcha, então mesmo com cache em memória pode haver flash. Precisamos: (a) cache **persistente** entre reloads, (b) responder offline com último valor conhecido.

### Solução

**1. Persistir cache do React Query em IndexedDB**
- Adicionar `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` + `idb-keyval`.
- Em `App.tsx`, trocar `QueryClientProvider` por `PersistQueryClientProvider` com persister IndexedDB.
- Configuração: `maxAge: 24h`, `buster` = build stamp (invalida cache em deploy novo), persistir só queries com `["active-orders"]`, `["table-count"]`, `["products"]`, `["menu"]` (whitelist via `dehydrateOptions.shouldDehydrateQuery`).
- Resultado: ao abrir o app/voltar à grade, dados aparecem **instantâneos do disco**, e o refetch acontece em background.

**2. Cache de respostas Supabase REST no Service Worker (stale-while-revalidate)**
- Atualizar `public/sw.js` para interceptar requisições GET para `*.supabase.co/rest/v1/*` com estratégia **stale-while-revalidate**:
  - Responder do cache imediatamente (se houver).
  - Disparar fetch em paralelo e atualizar o cache.
- Isso cobre o caso de "offline real" (sem rede): a query do React Query recebe a última resposta do Supabase via SW, e a UI continua funcional.
- Manter POST/PATCH/DELETE intocados (passam direto, nunca cacheados).
- Não cachear `/auth/*` nem realtime websockets.

**3. Bump de versão do cache**
- `CACHE_NAME` continua usando `BUILD_STAMP` — limpa cache antigo automaticamente em cada deploy.
- Adicionar segundo cache `plano-b-api-${BUILD_STAMP}` para respostas Supabase, separado dos assets.

**4. TableGrid: usar `placeholderData` + `keepPreviousData`**
- Em `useQuery(["active-orders"])`, adicionar `placeholderData: (prev) => prev` para evitar flash de loading entre montagens dentro da mesma sessão.
- Já temos cache otimista (do plano anterior) — agora soma-se cache persistente em disco.

### Arquivos
- **Editado** `package.json` — adicionar `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `idb-keyval`.
- **Editado** `src/App.tsx` — trocar provider por `PersistQueryClientProvider`, configurar persister IndexedDB com whitelist de queries e buster por build.
- **Editado** `public/sw.js` — adicionar handler stale-while-revalidate para Supabase REST, cache `plano-b-api-*` separado.
- **Editado** `src/components/palm/TableGrid.tsx` — adicionar `placeholderData: (prev) => prev` na query de `active-orders`.

### Observações técnicas
- O SW só roda em produção (já filtrado em `main.tsx` para preview/iframe) — então o stale-while-revalidate não atrapalha o editor.
- IndexedDB persiste mesmo sem SW, então o cache de queries funciona também no preview.
- `buster` = `__APP_VERSION__` (já injetado pelo Vite) garante que após deploy o cache antigo é descartado.
- Realtime continua sobrescrevendo dados frescos por cima do cache persistido — sem risco de mostrar dados velhos por muito tempo quando online.

### Resultado
- Voltar do Menu para a TableGrid: dados aparecem **no mesmo frame**, sem skeleton/loading.
- Recarregar a aba offline: app abre com último estado conhecido em vez de tela em branco.
- Conexão volta: realtime + refetch em background atualizam silenciosamente.

