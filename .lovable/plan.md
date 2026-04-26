# Plano: corrigir "Erro ao enviar pedido" e criar repositório de erros

## 🔍 Causa raiz identificada

Existem **DUAS versões da função `create_public_order`** no banco de dados, com a **mesma assinatura** (mesmos 10 parâmetros, mesmos tipos), mas com **ordem diferente** dos parâmetros nomeados:

| Versão | Ordem dos parâmetros |
|---|---|
| OID 23283 (nova) | `slug, name, phone, service_type, payment_method, change_for, address, items, note, client_request_id` |
| OID 23077 (antiga) | `slug, service_type, phone, name, address, items, payment_method, change_for, note, client_request_id` |

Quando o frontend chama via `supabase.rpc("create_public_order", { p_customer_name: "...", ... })`, o PostgREST/PostgreSQL **não consegue decidir qual versão executar** → retorna erro genérico → frontend mostra "Não foi possível enviar o pedido".

Esse problema só aparece em produção porque migrações antigas deixaram a função antiga viva.

## 🛠️ O que vou fazer

### 1. Remover a função duplicada (migração SQL)
- `DROP FUNCTION` da versão antiga (OID 23077) usando assinatura específica.
- Manter apenas a versão atual e correta (OID 23283), que é a que o código TypeScript espera.
- Verificação: após o drop, `SELECT count(*) FROM pg_proc WHERE proname='create_public_order'` deve retornar 1.

### 2. Criar repositório de erros do dia
Criar tabela **`error_log`** para concentrar todos os erros que ocorrerem (frontend + backend):

```sql
CREATE TABLE public.error_log (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,        -- 'public_checkout' | 'pdv' | 'kitchen' | 'palm' | 'bridge' | 'rpc' | etc.
  severity text NOT NULL DEFAULT 'error', -- 'error' | 'warning' | 'info'
  code text,                   -- ex: 'restaurant_closed', 'function_not_unique', 'network'
  message text NOT NULL,
  context jsonb DEFAULT '{}',  -- detalhes (slug, items, user agent, route, etc.)
  resolved boolean NOT NULL DEFAULT false
);
```
- RLS: `INSERT` público (qualquer cliente reporta) + `SELECT` público (admin lê pelo painel).
- Índice em `occurred_at DESC` para listagem rápida.

### 3. Helper de log no frontend
Criar `src/lib/error-log.ts` com função `logError(source, message, context)` que insere na tabela. Será chamada:
- No `catch` de `PublicCheckout.tsx` (com payload, slug, total).
- No `catch` de `createPublicOrder` em `public-cart.ts`.
- Em qualquer outro `catch` crítico que detectarmos no caminho.

### 4. Painel "Erros do dia" no Admin
Nova aba/seção em `src/components/admin/SystemTab.tsx` (ou criar `ErrorLogPanel.tsx`):
- Lista os erros das **últimas 24h**, agrupados por `source` e `code`.
- Filtros: severidade, fonte, "só não resolvidos".
- Botão "marcar como resolvido".
- Botão "limpar erros antigos (>7 dias)".
- Atualiza via React Query a cada 30s.

### 5. Validação adicional no checkout
- Adicionar try/catch granular para distinguir erro de rede vs. erro do banco.
- Mostrar a mensagem real no toast em modo dev/preview para facilitar debug futuro.

## ✅ Critérios de aceite
1. Cliente consegue finalizar pedido em `/menu/plano-b/checkout` sem erro 500.
2. Tabela `error_log` existe e recebe inserts em qualquer falha.
3. Aba "Erros do dia" no Admin lista os erros recentes com timestamp, fonte, mensagem e contexto.
4. Botão de limpar/resolver funciona.
5. Build/typecheck limpos.

## 🚫 Fora de escopo (não tocar)
- desktop/main.cjs, preload, bridge, electron, .exe
- print_jobs, fila de impressão, RPCs de impressão
- PDV/Caixa / Cozinha / Palm (apenas leitura para garantir que nada quebra)
