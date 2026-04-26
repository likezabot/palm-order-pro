
# Plano: Autocorreções idempotentes do repositório de erros + auditoria

## Objetivo

Transformar o `health-check` em um motor de **rotinas de auto-cura nomeadas, idempotentes e auditáveis**. Cada rotina pode rodar várias vezes sem causar dano, e cada execução fica registrada no próprio `error_log` com código `auto_heal_*`.

---

## 1. Refatorar `supabase/functions/health-check/index.ts`

Hoje o `autoFix()` faz tudo junto. Vou separar em um array de **rotinas idempotentes**, cada uma com:

- `id` (slug único, ex: `purge_old_errors`)
- `description`
- `run(supabase)` → retorna `{ affected, details, ok }`
- Toda rotina é idempotente: rodar 2x seguidas não muda nada na 2ª execução.

### Rotinas que serão implementadas

| ID | O que faz | Idempotência |
|---|---|---|
| `purge_old_errors` | Apaga `error_log` com `occurred_at < now() - 14 dias` | Já idempotente (filtro por data) |
| `auto_resolve_network_errors` | Marca como `resolved=true` erros com `code IN ('network','timeout','fetcherror','aborterror','networkerror','failed_to_fetch')` que **não tiveram reincidência nas últimas 2h** | Filtra `resolved=false` antes de atualizar |
| `auto_resolve_transient_5xx` | Resolve erros HTTP 502/503/504 isolados (sem reincidência 1h) | Filtro por `code` + `resolved=false` |
| `fix_paid_without_served_at` | Preenche `served_at = updated_at` em `orders` com `status='paid' AND served_at IS NULL` | Filtro `IS NULL` garante idempotência |
| `dedupe_error_log_burst` | Para mesmo `(source, code, message)` com >50 ocorrências em 1h, mantém os 10 mais recentes e marca o resto como `resolved` com motivo `deduplicated_burst` | Filtro `resolved=false` |
| `auto_resolve_fixed_recurring` | Para códigos em `RECURRING_FIXES` que já foram corrigidos com sucesso há <1h, resolve as ocorrências antigas pendentes | Já filtra `resolved=false` |
| `expire_old_warnings` | Erros `severity='warning'` com mais de 7 dias e sem reincidência 24h → marca como `resolved` com motivo `auto_expired` | Filtro por idade + reincidência |

Todas usam `UPDATE ... WHERE resolved = false` e `INSERT` apenas no log de auditoria → re-executar é seguro.

### Auditoria por ação

Após cada rotina, **antes** de retornar, insere no `error_log`:

```ts
{
  source: "auto_heal",
  severity: result.affected > 0 ? "info" : "info",
  code: `auto_heal_${rule.id}`,
  message: `[${rule.id}] ${result.affected} registro(s) afetado(s)`,
  context: {
    rule_id: rule.id,
    description: rule.description,
    affected: result.affected,
    details: result.details,    // ex: ids tocados, contagens por code
    duration_ms,
    triggered_by: "cron" | "manual" | "boot",
    idempotent: true,
  },
  resolved: true,                // o próprio log de auditoria já nasce resolvido
}
```

E um resumo geral por execução:

```ts
code: "auto_heal_run_summary"
context: { rules_executed, total_affected, failures, triggered_by }
```

### Tratamento de falha por rotina

- Cada `run()` é envolvido em `try/catch`; se falhar, loga `code: auto_heal_failed` com `severity: error`, `context.rule_id`, e segue para a próxima (não derruba a execução inteira).

### Endpoint `?action=`

- `GET /health-check` → roda checks + todas as rotinas (comportamento atual + novas rotinas)
- `POST /health-check?action=run_rule&id=purge_old_errors` → executa apenas 1 rotina (útil pro botão do painel)
- `POST /health-check?action=list_rules` → devolve metadados das rotinas (id, description) para o painel listar
- Caminhos antigos (`?fix=function_not_unique`) continuam funcionando.

---

## 2. Cron a cada 5 minutos (faltava)

Hoje o `health-check` só roda quando alguém abre o app. Vou agendar via `pg_cron` + `pg_net`, igual ao resumo diário.

SQL a ser inserido (via insert tool, não migration, pois carrega URL/anon-key):

```sql
select cron.schedule(
  'health-check-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://gbpcjjtxqtzqotmkfxrh.supabase.co/functions/v1/health-check',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>","x-trigger":"cron"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);
```

(Sem o `HEALTH_CHECK_SECRET` ainda — a proteção da edge function fica para o próximo passo, conforme combinado.)

---

## 3. Painel admin — pequenas adições em `DailyErrorsPanel.tsx`

Mínimo necessário para fechar o ciclo de auditoria:

- Filtro extra: **"Origem = auto_heal"** já vai aparecer naturalmente no filtro de source (porque os logs novos usam `source='auto_heal'`).
- Botão **"Rodar autocorreções agora"** no topo do painel → chama `health-check` com `?trigger=manual`.
- Linha mostra o `rule_id` quando o code começa com `auto_heal_`.

(Sem grandes refatorações — apenas tornar visível o que já está sendo gravado.)

---

## 4. Critérios de aceite

1. Rodar `health-check` 2x seguidas: a 2ª roda 0 alterações nas mesmas tabelas (idempotência confirmada).
2. Para cada rotina executada, existe pelo menos 1 linha no `error_log` com `code = auto_heal_<id>` e `context.rule_id` preenchido.
3. Existe 1 linha `auto_heal_run_summary` por execução.
4. Cron `health-check-every-5-min` aparece em `cron.job` e é disparado a cada 5 min (visível em `cron.job_run_details`).
5. Erros antigos (>14 dias) são apagados; erros de rede sem reincidência 2h ficam `resolved=true` com `context.resolved_reason` preenchido.
6. Botão "Rodar autocorreções agora" no painel funciona e a tabela atualiza.
7. Build e typecheck limpos. Nenhum arquivo de impressão / Electron / bridge tocado.

---

## 🚫 Fora de escopo (intocável)

- `desktop/`, `electron/`, `bridge/`, `.exe`
- `print_jobs`, fila de impressão, RPCs de impressão (continua só LOG, sem auto-correção)
- RLS — não mexe em política nenhuma
- `HEALTH_CHECK_SECRET` / proteção da edge function — fica para a próxima rodada (você sinalizou que faria depois)
- Pagamento, fluxo de pedidos, PDV, Palm, Cozinha — sem alterações comportamentais
