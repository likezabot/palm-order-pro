

## Diagnóstico

**Causa raiz: funções duplicadas (overloads) no banco de dados.**

O banco possui **múltiplas versões** da mesma função com assinaturas diferentes:

```text
create_order:
  1. (text, text, numeric, jsonb)                              ← ANTIGA
  2. (text, text, numeric, jsonb, boolean)                     ← NOVA

update_order_items:
  1. (uuid, numeric, jsonb, jsonb, text)                       ← ANTIGA
  2. (uuid, numeric, jsonb, jsonb, text, integer)              ← ANTIGA
  3. (uuid, numeric, jsonb, jsonb, text, integer, boolean)     ← NOVA
```

Quando o frontend chama `create_order` com 5 parâmetros (incluindo `p_should_print`), o PostgreSQL pode resolver para a versão correta. Mas com `update_order_items`, os parâmetros opcionais (`DEFAULT NULL`) criam ambiguidade entre as 3 overloads — o PostgreSQL não consegue decidir qual chamar e retorna erro.

O PostgREST (API do banco) pode também falhar ao tentar resolver a função correta quando existem overloads com parâmetros default.

## Plano de Correção

### 1. Migration SQL — Limpar overloads antigos
Criar uma migration que:
- Remove as versões antigas das funções (sem `p_should_print`)
- Mantém apenas a versão mais completa de cada função
- Garante que `p_should_print` tem `DEFAULT true` para compatibilidade

```sql
-- Dropar overloads antigos de create_order
DROP FUNCTION IF EXISTS public.create_order(text, text, numeric, jsonb);

-- Dropar overloads antigos de update_order_items
DROP FUNCTION IF EXISTS public.update_order_items(uuid, numeric, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.update_order_items(uuid, numeric, jsonb, jsonb, text, integer);

-- Recriar as funções finais (versão única de cada)
-- create_order com p_should_print boolean DEFAULT true
-- update_order_items com p_should_print boolean DEFAULT true
```

Também limpar overloads de `pay_order`:
```sql
DROP FUNCTION IF EXISTS public.pay_order(uuid, text, numeric);
```

### 2. OrderReview.tsx — Logs completos e erro real
Alterações no `catch`:
- Substituir mensagem genérica por `err.message`, `err.details`, `err.hint`
- Adicionar `console.log` detalhado antes de cada RPC com: mesa, garçom, versão, shouldPrint, printType, payload completo
- Adicionar `console.log` da resposta/erro completo após cada RPC

### 3. Arquivos alterados
| Arquivo | Alteração |
|---|---|
| Migration SQL (nova) | Remove overloads antigos, mantém versão única com `p_should_print` |
| `src/components/palm/OrderReview.tsx` | Logs detalhados + erro real no toast |

### Detalhes técnicos

**Migration final** recria `create_order` e `update_order_items` como função única cada, eliminando ambiguidade de overloads. Os defaults (`p_should_print DEFAULT true`, `p_expected_version DEFAULT NULL`, etc.) permitem chamadas com ou sem esses parâmetros.

**Erro real no toast** — o `catch` passa a exibir:
```
title: "Erro ao enviar pedido"
description: `${err.message}${err.details ? ' — ' + err.details : ''}${err.hint ? ' (Dica: ' + err.hint + ')' : ''}`
```

**Modal** já está implementado corretamente no código atual — o problema era apenas o backend falhando.

