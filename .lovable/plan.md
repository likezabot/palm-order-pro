

## Verificação de conectividade — Internet + Realtime + Cache offline

Adicionar uma camada client-side que monitora **três sinais independentes** e avisa o operador quando algo está instável, sem quebrar o fluxo atual nem mexer no backend/bridge.

### Sinais monitorados

1. **Internet (online/offline)**
   - `navigator.onLine` + eventos `online`/`offline`
   - Reforço com ping leve a `https://www.google.com/generate_204` a cada 30s (só quando "online" reportado, pra detectar wifi-sem-internet)

2. **Realtime WebSocket**
   - Já temos `realtimeStatus` no `usePdvRealtime`. Vou centralizar num **store global** (`connectivity-store.ts`) que qualquer canal pode reportar.
   - Detecta instabilidade: status `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED` ou ausência de heartbeat por >45s.

3. **Backend (Supabase REST)**
   - Ping leve via `supabase.from("settings").select("key").limit(1)` a cada 60s.
   - Detecta caso onde WebSocket caiu mas REST ainda funciona (modo degradado).

### Arquitetura

```
┌──────────────────────────────────────┐
│  connectivity-store.ts (singleton)   │
│  - internet: online/offline/unknown  │
│  - realtime: online/degraded/offline │
│  - backend:  online/offline          │
│  - lastHeartbeat                     │
│  - subscribers (Set<fn>)             │
└──────────────────────────────────────┘
        ▲                    │
        │                    ▼
   reportRealtime()    useConnectivity() hook
        │                    │
        │                    ▼
   usePdvRealtime      <ConnectivityBanner />
   (e outros canais)   (mostra avisos)
```

### Componentes

**1. `src/lib/connectivity-store.ts`** (novo)
- Estado global com pub/sub.
- Métodos: `reportRealtime(status)`, `reportBackend(ok)`, `reportInternet(ok)`, `subscribe(fn)`, `getState()`.
- Logs via `debugLog` (categoria nova: `"connectivity"`).

**2. `src/lib/connectivity-monitor.ts`** (novo)
- Singleton iniciado no `main.tsx`.
- Loop a cada 30s: ping internet (HEAD `generate_204` com timeout 3s).
- Loop a cada 60s: ping backend (Supabase REST query mínima).
- Listeners `window.online`/`offline`.
- Pausa pings quando `document.hidden`.

**3. `src/hooks/use-connectivity.ts`** (novo)
- Hook que assina o store e devolve `{ internet, realtime, backend, isFullyOnline, isDegraded }`.

**4. `src/components/ConnectivityBanner.tsx`** (novo)
- Banner sutil no topo, só aparece quando há problema:
  - 🔴 **Sem internet** — "Trabalhando offline. Pedidos serão sincronizados ao reconectar." (vermelho)
  - 🟡 **Realtime instável** — "Atualizações em tempo real interrompidas. Recarregando dados a cada 10s." (amarelo)
  - 🟡 **Backend lento** — "Conexão com servidor degradada." (amarelo)
- Botão "Reconectar agora" → força reconnect do canal Realtime + ping backend.
- Auto-dismiss quando tudo voltar.

**5. Integração no `usePdvRealtime`**
- Reporta status para o store (`reportRealtime`).
- Quando detecta instabilidade prolongada (>45s sem evento), aumenta polling de `invalidateQueries` automaticamente (de 0 para a cada 10s) como fallback.

**6. Cache offline parcial**
- React Query já tem cache em memória. Vou:
  - Aumentar `staleTime` para 5min nos `pdv-orders`/`pdv-items` quando offline.
  - Configurar `networkMode: "offlineFirst"` nas queries críticas, garantindo que a UI sempre mostre a última versão conhecida mesmo sem rede.
  - Adicionar `gcTime: 30 * 60 * 1000` (30min) pra não descartar dados durante quedas.
  - Não vamos persistir no IndexedDB (escopo controlado) — o cache de sessão já cobre quedas curtas/médias.

### Onde monta o banner
- `App.tsx` no topo (acima das rotas), pra aparecer em qualquer página.

### Garantias de segurança
- **Bridge `.exe` intocado**.
- **Backend intocado** — só consultas existentes.
- **Pipeline de impressão intocado** — fila local já cobre offline.
- **Realtime intocado** — só observamos status, não modificamos canais existentes.
- Nenhuma migration.

### Arquivos novos
- `src/lib/connectivity-store.ts`
- `src/lib/connectivity-monitor.ts`
- `src/hooks/use-connectivity.ts`
- `src/components/ConnectivityBanner.tsx`

### Arquivos modificados
- `src/main.tsx` — inicia monitor
- `src/App.tsx` — monta banner + ajusta defaults do QueryClient
- `src/hooks/use-pdv-realtime.ts` — reporta status, fallback polling

### Resultado esperado
- Operador vê na hora se: caiu internet, caiu Realtime, ou backend está lento.
- Pedidos antigos continuam visíveis offline (cache React Query).
- Ao voltar a rede, banner some sozinho e dados re-sincronizam.
- Console tem logs claros (categoria `connectivity`) para depuração.

