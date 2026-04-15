

## Causa Raiz

O `update_order_items` RPC faz `DELETE all + INSERT all`, ou seja, substitui todos os itens. O PDV detecta a mudança (via `printed_at = NULL` reset) e chama `autoPrintOrder`, que busca **todos** os itens e imprime a comanda completa. Não existe conceito de "delta" — o sistema não sabe quais itens são novos vs. antigos.

## Plano de Implementação

### 1. Salvar snapshot dos itens antigos antes de atualizar (OrderReview + Palm)

**`src/pages/Palm.tsx`**: Ao carregar mesa existente (`handleSelectTable`), guardar os itens originais num estado separado `originalCart: CartItem[]`.

**`src/components/palm/OrderReview.tsx`**: Receber `originalCart` como prop. No `handleFinalize` para pedidos existentes:
- Calcular o delta (itens novos ou com quantidade aumentada)
- Enviar o delta como metadado junto com a atualização
- Salvar o delta em `localStorage` com chave `delta:{orderId}` para o PDV consumir na autoimpressão

### 2. Criar função de cálculo de delta (`src/lib/order-delta.ts`)

```typescript
interface DeltaItem {
  product_name: string;
  quantity: number;      // quantidade ADICIONADA (não total)
  product_price: number;
  note?: string | null;
}

function calculateDelta(oldCart: CartItem[], newCart: CartItem[]): DeltaItem[]
```

Lógica:
- Para cada item no `newCart`, verificar se existe no `oldCart` (por `product.id`)
- Se não existia → item inteiro é delta
- Se existia mas qty aumentou → delta = diferença de qty
- Se qty diminuiu ou item removido → ignorar (não é acréscimo)

### 3. Persistir delta no banco para o PDV consumir

Criar uma coluna `delta_items` (jsonb, nullable) na tabela `orders`, ou usar uma abordagem mais simples: salvar numa tabela `order_deltas` ou no próprio RPC.

**Abordagem escolhida**: Adicionar campo `delta_items jsonb` na tabela `orders`. O RPC `update_order_items` receberá um parâmetro extra `p_delta_items jsonb` e salvará no pedido. Isso é mais simples que localStorage (funciona cross-device).

**Migration SQL**:
```sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delta_items jsonb;
```

**Atualizar RPC** para aceitar e salvar `p_delta_items`.

### 4. Impressão automática de delta no PDV (`src/lib/print-service.ts`)

Criar `autoPrintDelta(order)`:
- Ao detectar UPDATE relevante, buscar `delta_items` do pedido
- Se existir delta → imprimir apenas o delta com layout "ACRESCIMO"
- Se não existir delta (ex: edição manual) → imprimir completo como fallback

### 5. Criar layout de impressão "ACRESCIMO" (`src/lib/thermal-printer.ts` + `print-receipt.ts`)

Novo builder `buildEscPosDelta` e `buildDeltaHtml`:
- Cabeçalho: nome do estabelecimento
- Título destacado: `*** ACRESCIMO ***`
- Mesa + Garçom + Data/Hora
- Apenas os itens do delta
- Sem total geral (ou total do acréscimo apenas)

### 6. Botões manuais no PDV (`src/pages/Pdv.tsx`)

Substituir o botão único "REIMPRIMIR CUPOM" por 3 botões discretos:
- **Imprimir Acréscimo** (só aparece se `delta_items` existe) — imprime delta
- **Imprimir Pedido** — imprime comanda completa
- **Imprimir Conta** — imprime conta final com layout de conta

### 7. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/` | ADD `delta_items jsonb` + atualizar RPC |
| `src/lib/order-delta.ts` | **Novo** — cálculo de delta |
| `src/lib/thermal-printer.ts` | `buildEscPosDelta` |
| `src/lib/print-receipt.ts` | `printDelta`, `printBill`, `buildDeltaHtml` |
| `src/lib/print-service.ts` | `autoPrintDelta`, lógica de UPDATE usa delta |
| `src/pages/Palm.tsx` | Estado `originalCart` |
| `src/components/palm/OrderReview.tsx` | Prop `originalCart`, calcular e enviar delta |
| `src/pages/Pdv.tsx` | 3 botões de impressão, autoprint usa delta |
| `src/lib/types.ts` | Adicionar `delta_items` ao type `Order` |

### Fluxo final

```text
Palm (garçom edita mesa)
  → calcula delta (newCart vs originalCart)
  → chama RPC com p_delta_items = delta
  → banco salva delta_items + reseta printed_at

PDV (realtime detecta UPDATE)
  → busca order com delta_items
  → se delta_items existe → imprime layout ACRESCIMO
  → se não → imprime completo (fallback)

Botões manuais:
  → "Imprimir Acréscimo" → usa delta_items salvo
  → "Imprimir Pedido" → comanda completa
  → "Imprimir Conta" → layout de conta final
```

