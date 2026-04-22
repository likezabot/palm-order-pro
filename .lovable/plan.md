

# Vistoria geral — relatório e melhorias seguras

## ✅ O que está funcionando

- **Testes:** 80/80 passam (15 arquivos, 8.4s).
- **Edge functions:** todas em HTTP 200 (`telegram-webhook`, `notify-telegram`).
- **Parser Telegram:** entrada em lote funcionou — 6 `stock_in` registrados nas últimas 24h.
- **Banco:** 38 itens de estoque ativos, 42 produtos ativos, 0 pedidos abertos, 0 itens na fila de notificação.
- **Sem runtime errors no front.**
- **Bridge `.exe`:** intacta. Nenhuma alteração proposta toca em `bridge/lp-bridge.js`, ESC/POS, ou contratos `/health` e `/print`.

## ⚠️ Problemas encontrados

### 1. Pedido travado em `print_status='printing'` (1 caso)
- ID `5274f48c…` mesa 3, pago, com `print_claimed_at` de 22/04 03:14 — bridge nunca confirmou/falhou. Ficou órfão.
- **Causa:** sem watchdog para reverter claims antigos.

### 2. 9 pedidos pagos com `print_status='pending'` acumulados
- Bridge offline quando foram pagos → entraram na fila e ficam tentando reimprimir para sempre.
- Não atrapalham o uso, mas poluem a `PrintQueuePanel` e geram requests inúteis.

## 🛠️ Melhorias propostas (sem tocar na bridge)

### A. Watchdog de impressão (migration SQL — segura)
Criar função `recover_stuck_prints()` que reverte qualquer pedido em `printing` com `print_claimed_at < now() - interval '2 minutes'` de volta para `pending` com `print_last_error='timeout'`. Agendar via `pg_cron` a cada 1 minuto. **Não muda contrato com a bridge** — só limpa órfãos.

### B. Auto-cancelar prints muito antigos de pedidos pagos
Se um pedido está `paid` + `pending` há mais de 2 horas, marcar como `printed` automaticamente (via mesma função do watchdog). Evita acúmulo perpétuo. Limpa os 9 órfãos atuais sem ação manual.

### C. Botão "Limpar fila órfã" na `PrintQueuePanel`
Pequeno botão admin em `src/components/print-station/PrintQueuePanel.tsx` que chama RPC para marcar os órfãos como impressos. Útil em dia que a bridge ficou off horas.

### D. Cleanup de notification_queue antigas
Atualmente não há expiração. Adicionar trigger/cron diário que apaga registros `processed_at < now() - 7 days`. Mantém a tabela leve.

### E. Indicador visual de bridge offline mais claro
`ConnectionStatusBanner` já mostra status, mas sugiro: quando offline + há pedidos pending, exibir contagem (`"Bridge offline · 9 cupons aguardando"`). Pequeno ajuste em `src/components/print-station/ConnectionStatusBanner.tsx` lendo `usePrintQueue`.

### F. Index sugerido
`CREATE INDEX IF NOT EXISTS idx_orders_print_status ON orders(print_status) WHERE print_status IN ('pending','printing');` — acelera as queries do worker e do watchdog.

## 🚫 O que **não** vou mexer (preserva a bridge `.exe`)

- `bridge/lp-bridge.js`, `bridge/package.json`, `start-bridge.bat`.
- `src/lib/thermal-printer.ts` (formato ESC/POS, payload base64, endpoints `/health` e `/print`).
- `src/lib/print-receipt.ts`, `src/lib/print-queue-worker.ts` (lógica de envio).

## Arquivos que serão modificados

- `supabase/migrations/<timestamp>_print_watchdog.sql` — nova função + cron + index.
- `src/components/print-station/PrintQueuePanel.tsx` — botão "Limpar órfãos".
- `src/components/print-station/ConnectionStatusBanner.tsx` — texto com contagem.

## Ordem de execução

1. Migration do watchdog + index + cleanup de queue.
2. UI: botão de limpeza + banner com contagem.
3. Rodar `vitest` para confirmar 80/80 ainda passa.
4. Verificar que os 10 pedidos órfãos foram resolvidos pelo watchdog.

