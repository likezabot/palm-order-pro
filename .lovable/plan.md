

# Plano: aba "Rede" no Admin com status de conectividade

## O que vai aparecer

Uma nova aba **"Rede"** no Admin (após "Sistema"), que mostra em tempo real **3 cards de status**:

### 1. Impressora (ponte local)
- Status: 🟢 Online / 🔴 Offline
- Latência (ms) do `GET http://localhost:9100/health`
- Impressora USB detectada: sim/não + quantidade
- Última verificação (timestamp)

### 2. Servidor (Lovable Cloud)
- Status: 🟢 Online / 🔴 Offline / 🟡 Degradado
- Latência (ms) do ping `GET /rest/v1/settings?limit=1`
- Status do Realtime: SUBSCRIBED / TIMED_OUT / CLOSED
- Tempo desde o último heartbeat do Realtime

### 3. Internet (do PC/tablet)
- Status: 🟢 Online / 🔴 Offline
- Latência (ms) do ping externo `https://www.google.com/generate_204`
- `navigator.onLine` (sinal nativo do navegador)
- Tipo de conexão (4G/Wi-Fi/etc) via `navigator.connection.effectiveType`

## Como vai funcionar

- **Auto-refresh a cada 5 segundos** enquanto a aba estiver aberta (pausa quando troca de aba para não gastar bateria/dados).
- Cada card mostra um **gráfico mini** das últimas 20 medições de latência (sparkline simples em SVG), pra você ver se a rede está estável ou oscilando.
- Botão **"Testar agora"** em cada card pra forçar uma medição imediata.
- Cores semânticas:
  - 🟢 verde: latência < 200ms
  - 🟡 amarelo: 200-800ms
  - 🔴 vermelho: > 800ms ou offline

## Arquivos a criar/editar

**Novo**: `src/components/admin/NetworkTab.tsx`
- Componente principal com 3 cards.
- Hook interno `useNetworkPings` que mede latência das 3 fontes a cada 5s.
- Histórico em memória (array de últimas 20 medições por fonte).
- Sparkline SVG inline pra cada card.

**Editar**: `src/pages/Admin.tsx`
- Adicionar aba "Rede" no `TabsList` (ícone `Activity` do lucide-react).
- Adicionar `<TabsContent value="network">` chamando `<NetworkTab />`.
- Aba marcada como `admin-only` (oculta em modo Garçom).

## Detalhes técnicos

**Medição de latência** (3 endpoints independentes):
```ts
// Ponte local
const t0 = performance.now();
await fetch('http://localhost:9100/health', { signal: AbortSignal.timeout(3000) });
const latency = performance.now() - t0;
```

**Realtime status**: lê do `connectivity-store` já existente (`src/lib/connectivity-store.ts`) via `useConnectivity()` (hook já presente em `src/hooks/use-connectivity.ts`).

**Sparkline**: SVG `<polyline>` com `points` calculado a partir do array de medições, normalizado para o `<svg viewBox="0 0 100 30">`. Sem libs externas.

**Pausar quando aba escondida**: usa `document.visibilityState` no `useEffect` do hook.

## Resultado prático

- Você abre Admin → aba "Rede".
- Vê na hora se a impressora caiu, se a internet do PC tá lenta, ou se o servidor tá demorando.
- O sparkline mostra picos de latência ao longo do tempo (ex.: internet caiu por 30s e voltou).
- Sem precisar abrir DevTools nem pingar manualmente.

