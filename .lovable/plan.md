

# Correção cirúrgica — Runtime global de pedidos e impressão

## Diagnóstico exato do gargalo

Auditando o repo atual, confirmei o que você suspeitava:

**1. `src/main.tsx` não sobe nenhum listener operacional global.**
Sobe só `startPrintQueueWorker()` (retry de bridge offline) e `startConnectivityMonitor()`. Não há listener global de `orders`.

**2. A autoimpressão depende 100% de tela aberta:**
- `src/hooks/use-pdv-realtime.ts` → só monta quando `Pdv.tsx` está aberto
- `src/pages/PrintStation.tsx` → só monta quando essa rota está aberta
- Se o app estiver na Home / Admin / Kitchen / Stock / Palm → **ninguém escuta `INSERT orders` para imprimir**. O pedido fica `print_status='pending'` até alguém abrir PDV ou PrintStation.

**3. Central (PDV) atualiza com atraso:**
- `useQuery` com `refetchInterval: 10000` (polling 10s pesado).
- Realtime invalida só `pdv-orders` / `pdv-items` — funciona, mas se a aba PDV não está focada, nada acontece até abrir.

**4. Delay fixo de 2s** em `usePdvRealtime` e `PrintStation` — antes de chamar `autoPrintOrder`. O `print-service` já tem retry interno de 6× (até 6s) buscando `order_items`, então os 2s extras são redundantes.

**5. Telegram entra pelo mesmo pipeline.** O webhook (`telegram-webhook/index.ts`) usa `sb.rpc("create_order", …)` e `sb.rpc("update_order_items", …)`, que gravam `print_status='pending'`. Hoje só imprime se PDV ou PrintStation estiver aberto. **Não preciso tocar no parser/batch/wizard** — basta o runtime global escutar.

**6. Duplicidade hoje é evitada por `claim_order_print` (RPC atômica)** — quem ganhar o claim imprime; outras telas recebem `already_claimed`. Isso continua valendo.

**7. Pendentes ao abrir o app não são reprocessados.** Se chegou um pedido com o app fechado, ninguém faz bootstrap.

## O que vou fazer

### 1. Criar `src/lib/global-order-runtime.ts` (novo, ~180 linhas)

Singleton iniciado em `main.tsx`. Responsável S