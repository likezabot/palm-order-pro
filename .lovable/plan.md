
The user reports the Palm menu page hangs infinitely after publishing. Looking at MenuView.tsx, the products query uses `useQuery` but I don't see a loading state — if products are loading, `filtered` is empty and shows nothing. But "rodando infinitamente" suggests it never resolves.

Possible causes:
1. The `useQuery` has no error/loading UI — silent fail.
2. Auto-refresh loop: version-check.ts may be reloading repeatedly if `__APP_VERSION__` keeps changing or RELOAD_FLAG logic is broken on this route.
3. Service worker serving stale bundle that errors out.

Most likely: the version-check reload loop. After the recent SW changes, the BUILD_STAMP changes every build, but the client `__APP_VERSION__` (defined in vite.config) may not match what's stored, causing reload → SW updates → reload cycle.

Need to check vite.config.ts and main.tsx to confirm.

## Plan: Diagnosticar e corrigir loop infinito no Palm após publish

### Investigação
1. Ler `vite.config.ts` para ver como `__APP_VERSION__` é definido.
2. Ler `src/main.tsx` para ver registro do SW + chamada de `checkAndUpdateVersion`.
3. Confirmar se há loop entre version-check.ts ↔ SW update ↔ reload.

### Hipótese principal
O `checkAndUpdateVersion` + auto-update do SW (a cada 30s + on focus) podem entrar em conflito:
- SW detecta nova versão → dispara `UpdateBanner` → reload em 2s.
- Após reload, `__APP_VERSION__` ainda é o mesmo bundle servido (cacheado), version-check vê diferença → limpa cache → reload de novo.
- E também: MenuView faz `useQuery` mas não mostra loading/erro → tela em branco enquanto isso.

### Correções
1. **MenuView.tsx**: adicionar estados de loading e erro visíveis (em vez de tela vazia que parece "infinito").
2. **version-check.ts** + **main.tsx**: garantir que o SW update não dispare reload se o bundle já está atualizado. Adicionar guarda extra no RELOAD_FLAG (timestamp) para impedir reloads em <10s.
3. **Não mexer** em: pedidos, RPC, bridge, impressão, outras telas.

### Arquivos a alterar
- `src/components/palm/MenuView.tsx` — loading/erro visíveis.
- `src/lib/version-check.ts` — guarda anti-loop reforçada.
- `src/main.tsx` — desativar polling agressivo (30s) e manter só on focus, para reduzir chance de loop em produção.

### Critério de aceite
- Palm sempre mostra "Carregando cardápio..." ou erro claro, nunca tela em branco.
- Sem loop de reload após publish.
- Auto-update continua funcionando (banner aparece em troca de foco).
