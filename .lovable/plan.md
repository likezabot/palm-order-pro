

## Sistema lento — reduzir polling redundante e manter Palm fluido

### Diagnóstico
Cada tela tem `refetchInterval` de 5s **somado a Realtime + invalidações otimistas + `refetchOnWindowFocus`**. Resultado: a cada 5s o app dispara 2-4 queries grandes (com joins `order_items`) em paralelo. Em rede mais fraca, isso satura e tudo "engrossa".

Lista de timers ativos hoje (visíveis ao mesmo tempo no Palm):
- `TableGrid["active-orders"]` — refetch 5s + Realtime + tick 30s
- `RecentItemsPanel` — `setInterval(fetchItems, 15s)` mesmo fechado (lista nova)
- `connectivity-monitor` — internet 30s, backend 60s, staleness 15s
- `print-queue-worker` — tick 15s
- `refetchOnWindowFocus: true` global → cada toggle de aba dispara refetch em todas

### Mudanças

**1. Realtime já cobre — derrubar `refetchInterval` redundante**
- `TableGrid` (`active-orders`): `refetchInterval: 5000` → **`30_000`** (Realtime invalida em <1s; polling vira só rede de segurança).
- `Kitchen` (orders + items): `5000` → **`15_000`**.
- `Cashier` (orders + items): `5000` → **`20_000`**.
- `Admin` (orders): `5000` → **`30_000`**.
- `DuplicatesResolver`: `5000` → **`20_000`** (raro, não precisa quase-realtime).
- `Pdv` já está em 10s — manter.
- `StatsPanel` — manter (30s/60s já é razoável).

**2. RecentItemsPanel: só pollar quando o Sheet está aberto**
- Hoje o `RecentItemsList` faz `setInterval(fetchItems, 15s)` no mount. Como agora vive dentro do `Sheet`, **só monta quando aberto** — bom. Mas o componente velho `RecentItemsPanel` também ainda existe; manter intacto. Confirmar que `Sheet` desmonta o conteúdo ao fechar (default do Radix) — então o interval some sozinho.
- Subir intervalo de 15s → **30s** mesmo aberto (o painel é informativo, não crítico).

**3. Defaults globais do React Query mais conservadores**
- `staleTime: 30_000` → **`60_000`** (60s) — reduz refetch em focus dentro do mesmo minuto.
- `refetchOnWindowFocus: true` → **`"always"` apenas para queries críticas; default `false`**. Mudar para `false` no provider; deixar Realtime cuidar de fresh data.
- Manter `networkMode: "offlineFirst"` e `placeholderData: prev => prev` que já adicionamos.

**4. Connectivity monitor: aliviar pings**
- `INTERNET_INTERVAL`: 30s → **60s**.
- `BACKEND_INTERVAL`: 60s → **120s**.
- `STALENESS_INTERVAL`: 15s → **30s**.
- Realtime já reporta heartbeats; pings frequentes ao Google e Supabase só pra "saber que tá online" custam round-trips em mobile.

**5. Tela verde "PEDIDO ENVIADO" — manter rápida (~1s) como o usuário pediu**
- Hoje, para mesa (`!shouldShowBadge`), reset é em `requestAnimationFrame` (instantâneo demais — quase pisca).
- Mudar para **800ms** com `setTimeout`: dá tempo de ver o checkmark animado, sentir feedback de fluidez, e voltar pra grade. O cache otimista garante que a grade já vem com a mesa vermelha.
- Para badge (BALCÃO + impressão), **não mexer** (mantém 1500/2500/9000ms conforme estado).

### Arquivos
- `src/App.tsx` — `staleTime: 60_000`, `refetchOnWindowFocus: false`.
- `src/components/palm/TableGrid.tsx` — `refetchInterval: 30_000`.
- `src/pages/Kitchen.tsx` — `5000` → `15_000` nas duas queries.
- `src/pages/Cashier.tsx` — `5000` → `20_000` nas duas.
- `src/pages/Admin.tsx` — `5000` → `30_000`.
- `src/components/admin/DuplicatesResolver.tsx` — `5000` → `20_000`.
- `src/components/home/RecentItemsPanel.tsx` — interval `15_000` → `30_000` no `RecentItemsList`.
- `src/lib/connectivity-monitor.ts` — INTERNET 60s, BACKEND 120s, STALENESS 30s.
- `src/components/palm/OrderSuccess.tsx` — para `!shouldShowBadge`, trocar `requestAnimationFrame` por `setTimeout(800)`.

### Resultado esperado
- Tráfego de rede em background cai em ~70% (de ~12 requests/min para ~3-4/min em estado ocioso).
- UI continua "ao vivo" porque Realtime já entrega INSERT/UPDATE em <1s.
- Tela verde de sucesso fica visível ~1s, com feedback nítido de "deu certo" antes de voltar à grade já atualizada (cache otimista).
- Sem mudança de comportamento funcional, só menos pressão de rede/CPU.

