## Notificações em tempo real no grupo do Telegram

Vou transformar o grupo "Plano B Operacional" em um feed operacional automático. Toda movimentação relevante (pedidos, alterações, pagamentos, estoque) será postada como mensagem. À meia-noite, um relatório diário com ranking de garçons é enviado.

### 1. Liberar o chat atual

O grupo `-1003464296947` aparece como "não autorizado" no print. Primeiro passo: adicionar esse ID em `settings.telegram_allowed_chats` para o bot poder operar nele.

### 2. Eventos que serão notificados no grupo

**Pedidos (mesa/comanda):**

- 🆕 Novo pedido — Mesa X · Garçom Y · itens · total
- ➕ Acréscimo — Mesa X · itens adicionados
- ➖ Remoção — Mesa X · itens removidos
- ✅ Pago — Mesa X · método · valor · troco (se houver)
- 🔁 Mesa renomeada / movida

**Estoque:**

- 📦 Entrada — item · quantidade · estoque atual
- 📤 Saída — item · quantidade · estoque atual
- ⚠️ Estoque crítico — item atingiu mínimo
- 🚨 Item zerado / negativo

**Sistema:**

- 🖨️ Falha de impressão (opcional, configurável)

Cada notificação é resumida em 2–4 linhas, sem poluir o chat. Mensagens são throttled (debounce 1s) para não duplicar quando há muitas alterações em sequência.

### 3. Arquitetura

**Edge Function nova:** `notify-telegram`  
Recebe um payload `{ type, payload }` e formata + envia via gateway Telegram para o(s) chat(s) configurados em `settings.telegram_notify_chats` (lista separada por vírgula; default = `telegram_allowed_chats`).

**Disparo:** triggers SQL nas tabelas `orders`, `order_items`, `inventory_movements` chamam a função via `pg_net.http_post` (assíncrono, não bloqueia transação). Vantagens:

- Funciona mesmo quando pedido vem do PDV, Palm, Telegram ou bridge — qualquer origem dispara
- Zero código no front-end
- Tolerante a falhas (HTTP async)

**Tabelas envolvidas:**

- `settings` chave nova `telegram_notify_chats` (lista de chat_ids)
- `settings` chave nova `telegram_notify_config` (flags: pedidos, estoque, pagamentos, falhas — todas ON por default)

### 4. Relatório diário 00:00

**Edge Function nova:** `daily-waiter-report`

- Agrega `orders` do dia (status `paid`) agrupando por `waiter_name`
- Calcula: total de pedidos, total faturado, ticket médio, nº de itens
- Ordena ranking decrescente por faturamento
- Envia mensagem formatada:

```text
🏆 Fechamento do dia — 22/04
1º 🥇 Alice — R$ 1.240,00 (18 pedidos)
2º 🥈 Bruno — R$ 980,50 (14 pedidos)
3º 🥉 Carla — R$ 720,00 (11 pedidos)

Parabéns Alice! 🎉👏
Total da casa: R$ 2.940,50 · 43 pedidos
```

**Agendamento:** `pg_cron` rodando `0 3 * * *` UTC (= 00:00 BRT). Único job, idempotente (não dispara duas vezes para a mesma data).

### 5. Comandos novos no bot (opcionais, sem mudar os existentes)

- `notificações on/off` — liga/desliga o feed temporariamente
- `relatório` — dispara o relatório do dia atual sob demanda
- `estoque crítico` — lista itens abaixo do mínimo

### 6. Resumo técnico


| Arquivo                                           | O que faz                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `supabase/migrations/<ts>_telegram_notify.sql`    | Triggers em `orders`, `order_items`, `inventory_movements` + cron job diário + settings default |
| `supabase/functions/notify-telegram/index.ts`     | Formata e envia notificações via gateway Telegram                                               |
| `supabase/functions/daily-waiter-report/index.ts` | Agrega vendas do dia e envia ranking                                                            |
| `supabase/functions/telegram-webhook/index.ts`    | +3 comandos (`notificações`, `relatório`, `estoque crítico`)                                    |
| `settings` (linhas)                               | `telegram_allowed_chats` += `-1003464296947`, `telegram_notify_chats`, `telegram_notify_config` |


Sem mudanças no front-end. Sem mudanças nos fluxos de pedido/estoque atuais — apenas observamos o banco e notificamos.

### 7. Validação após implementar

1. Criar pedido no Palm → mensagem "🆕 Mesa X" cai no grupo
2. Adicionar item → "➕ Acréscimo"
3. Pagar no Caixa → "✅ Pago"
4. Lançar saída no estoque → "📤 Saída" + alerta se ficar crítico
5. Disparar `relatório` no chat → ranking aparece imediatamente
6. Confirmar cron agendado em `cron.job`

Pronto para produção quando os 6 itens passarem.

Plano aprovado com ajustes importantes:

&nbsp;

1. Não quero notificação crua de qualquer trigger em orders/order_items.

Quero notificação operacional consolidada, evitando duplicidade e spam no grupo.

&nbsp;

2. Priorizar estes eventos:

- novo pedido

- acréscimo consolidado

- remoção consolidada

- pagamento

- estoque crítico / zerado

- relatório diário

Os demais ficam opcionais.

&nbsp;

3. Não quero debounce dependente apenas de memória in-memory.

Se houver consolidação, ela precisa ser confiável e previsível.

&nbsp;

&nbsp;

5. Ranking diário deve considerar padronização de waiter_name para evitar nomes duplicados por grafia diferente.

&nbsp;

6. Antes de expandir para tudo, quero primeira fase com:

- pedidos

- pagamentos

- estoque crítico

- relatório diário

Depois avaliamos se vale adicionar mais notificações.