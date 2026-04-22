

## Fase 3 — Operações inteligentes (3 entregas)

Vou implementar na ordem aprovada: **fechamento de caixa → mesa parada → comando status**. Tudo via banco + edge functions, sem mexer no front.

### 1. Fechamento de caixa 💰

**Trigger novo:** `queue_cash_closed` em `cash_register` (AFTER UPDATE quando `status` vira `closed`).

Enfileira evento `cash_closed` com payload calculado em SQL:
- `total_sales` do registro
- soma de `cash_movements` por tipo (sangria/suprimento) durante a sessão
- `final_amount` (conferido) vs `initial_amount + vendas - sangrias + suprimentos` (esperado)
- diferença

Janela de consolidação: **5s** (fechamento é raro, não precisa muito).

**Mensagem:**
```
💰 Caixa fechado
Vendas: R$ 2.940,50
Sangrias: R$ 200,00
Suprimentos: R$ 50,00
Esperado: R$ 2.890,50 · Conferido: R$ 2.880,00
Diferença: -R$ 10,50 ⚠️
```

Sem diferença = sem ⚠️.

### 2. Alerta de mesa parada ⏰

**Edge function nova:** `check-stale-tables`
- Cron a cada **15 min** (`*/15 * * * *`)
- Busca pedidos:
  - `status = 'done'` há mais de **30 min** (esperando pagar)
  - `status IN ('new','preparing')` cujo `updated_at` é mais antigo que **60 min** (sem item novo)
- Para cada uma, enfileira evento `table_stale` com `consolidate_key = 'table_stale:<order_id>:<bucket_15min>'` para não repetir o alerta da mesma mesa toda hora — só a cada 15min se persistir.
- Idempotência adicional: só alerta se ainda não houve `notification_log` com mesma `dedupe_key` nas últimas 2h.

**Mensagem:**
```
⏰ Mesa parada
Mesa 5 · Garçom Alice
Aberta há 1h20 · Sem item novo há 45min
Total atual: R$ 180,00
```

Flag em `telegram_notify_config.stale_tables` (default ON).

### 3. Comando `mesa X status` 📋

**Update em `telegram-webhook`:** parser reconhece padrões:
- `mesa 5 status`
- `status mesa 5`
- `status 5`

Handler busca pedido ativo da mesa e responde no mesmo chat:
```
📋 Mesa 5
Garçom: Alice
Aberta há 35min · último item há 12min
• 2× Picanha
• 1× Coca 2L
• 3× Cerveja Heineken
Total: R$ 187,00
Status: preparando
```

Se não houver pedido ativo: "Mesa 5 está livre." 

Não duplica com `ver pedido` (que mostra detalhe completo) — `status` é o resumo curto.

### 4. Resumo técnico

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/<ts>_phase3_notifications.sql` | Trigger `queue_cash_closed` + função SQL auxiliar de cálculo |
| `supabase/functions/check-stale-tables/index.ts` | Cron 15min, varre mesas paradas e enfileira alertas |
| `supabase/functions/notify-telegram/index.ts` | +3 formatadores: `cash_closed`, `table_stale` |
| `supabase/functions/telegram-webhook/index.ts` | +1 comando: `mesa X status` |
| `cron.schedule` (via insert SQL) | Job `check-stale-tables` rodando `*/15 * * * *` |
| `settings.telegram_notify_config` | Adiciona flags `cash_closed` e `stale_tables` (default true) |

### 5. Validação

1. Abrir e fechar caixa no PDV → `💰 Caixa fechado` cai no grupo com totais
2. Deixar mesa em `done` por 31min → `⏰ Mesa parada` aparece no próximo ciclo
3. Mandar `mesa 1 status` no Telegram → bot responde resumo
4. Cron `check-stale-tables` listado em `cron.job`
5. Confirmar que mesma mesa parada não dispara alerta duplicado em <15min

Pronto para Fase 4 quando os 5 passarem.

