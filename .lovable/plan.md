

## Fixes de estabilidade — Realtime, localStorage e forwardRef

Aplicar 3 correções de estabilidade identificadas na auditoria, **sem tocar** no fluxo de impressão (bridge `.exe`, `print-service.ts`, `thermal-printer.ts`, `print-station`, `lp-bridge.js`, `BRIDGE_INSTRUCTIONS.md`).

### 1. Realtime — nomes de canal únicos por aba

**Problema:** canais com nome fixo (`pdv-realtime-v3`, `kitchen-realtime`, etc.) causam `CHANNEL_ERROR` quando o mesmo dispositivo abre 2+ abas/PWAs.

**Fix:** sufixar com `crypto.randomUUID()` na criação do canal — Supabase passa a tratar cada aba como cliente independente.

Arquivos:
- `src/hooks/use-pdv-realtime.ts` → `pdv-realtime-v3` → `pdv-realtime-${uuid}`
- `src/pages/Kitchen.tsx` → `kitchen-realtime` → `kitchen-realtime-${uuid}`
- `src/pages/PrintStation.tsx` → idem se houver canal fixo
- `src/pages/Palm.tsx` → idem se houver canal fixo

Sem mudança em handlers, eventos, queries ou lógica de auto-print.

### 2. `force-update.ts` — preservar configs locais

**Problema:** `localStorage.clear()` (ou remoção agressiva) apaga `waiter_name`, `print-config`, `autoprint`, favoritos, configs do bridge etc.

**Fix:** trocar para remoção seletiva apenas das chaves de versão/anti-loop:
- `app_version`
- `app_last_reload_ts`
- (mantém `sessionStorage.clear()` — é seguro)

Preserva 100% das configs do PDV/Palm/bridge. Arquivo: `src/lib/force-update.ts`.

### 3. `OrderRow.tsx` — corrigir warning de `forwardRef`

**Problema:** componentes filhos do Radix (`Tooltip`/`Button`) recebem `ref` mas o `OrderRow` é função simples → warning "Function components cannot be given refs".

**Fix:** envolver `OrderRow` em `React.forwardRef<HTMLDivElement, OrderRowProps>(...)` e encaminhar `ref` ao container raiz. Sem mudança visual nem de comportamento.

### Garantias (não muda nada do .exe)

- Bridge USB (`bridge/lp-bridge.js`, `start-bridge.bat`): **intocado**.
- `src/lib/print-service.ts`, `print-receipt.ts`, `thermal-printer.ts`, `receipt-html.ts`, `receipt-layout.ts`, `print-iframe.ts`, `reprint-senha.ts`: **intocados**.
- Página `PrintStation.tsx`: só ajuste de nome de canal (se aplicável); handlers de impressão preservados.
- Auto-print do PDV (`autoPrintOrder` / `autoPrintDelta` em `usePdvRealtime`): preservado — apenas o nome do canal muda.
- RPCs `claim_order_print` / `complete_order_print` / `fail_order_print`: **intocadas**.

### Arquivos afetados (4-5)

- `src/hooks/use-pdv-realtime.ts`
- `src/pages/Kitchen.tsx`
- `src/pages/PrintStation.tsx` (se tiver canal fixo)
- `src/pages/Palm.tsx` (se tiver canal fixo)
- `src/lib/force-update.ts`
- `src/components/pdv/OrderRow.tsx`

### Resultado esperado

- Múltiplas abas/PWAs do PDV no mesmo dispositivo deixam de derrubar o Realtime.
- Botão "Forçar atualização" não apaga mais nome do garçom, configs de impressora ou autoprint.
- Console limpo do warning de `forwardRef` no PDV.
- Bridge `.exe` e todo o pipeline de impressão seguem **idênticos** ao atual.

