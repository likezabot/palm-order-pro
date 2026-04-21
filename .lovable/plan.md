

## Botão "Servido" nos cards de mesa

Hoje os cards de mesa ocupada (TableGrid no Palm) mostram garçom, valor e tempo, mas não há marcação visual de que o pedido **já foi entregue ao cliente** — útil pra distinguir mesas em produção das mesas que estão comendo.

### Mudanças

**1. Campo no banco**
- Nova coluna `served_at timestamptz` na tabela `orders` (nullable). Quando preenchida = mesa servida. Quando null = ainda não servida.
- Mantém `status` atual intacto (não bagunça fluxo do Kitchen/Cashier).

**2. Botão "✓ Servido" dentro do card de mesa ocupada**
- Aparece como pequeno chip discreto no canto inferior do card (overlay, não intercepta clique principal de abrir a mesa).
- **Não servida** → botão outline com ícone `UtensilsCrossed`, label "Servir" (clicar marca como servido)
- **Já servida** → badge sólido verde com ícone `Check`, label "Servido · 12min" (mostra tempo desde que foi servido). Clicar reabre confirmação para desmarcar (caso de erro).

**3. Estado visual da mesa servida**
- Mesa ocupada normal → mantém vermelho atual
- Mesa servida (comendo) → muda para **azul suave** (`bg-blue-500/20 border-blue-500`), pulso desliga. Comunica "estável, comendo".
- Mesa aguardando pagamento (`status=done`) → mantém âmbar atual (prioridade sobre servido).
- Mesa com duplicatas → mantém amarelo (prioridade máxima).

Ordem de prioridade visual: duplicatas > aguardando pagto > servida > ocupada > livre.

**4. Reset automático**
- Quando o pedido é fechado/pago (status vira `paid`/`canceled`), `served_at` não importa mais (mesa some da grade).
- Quando garçom **adiciona novos itens** a uma mesa já servida, opcionalmente resetamos `served_at = null` automaticamente? → **sim**, faz sentido: se chegou rodada nova, mesa volta a "em produção" até ser servida de novo. Implementado via trigger no insert de `order_items` que zera `served_at` do pedido pai.

### Arquivos

**Migração SQL**
- `ALTER TABLE orders ADD COLUMN served_at timestamptz`
- Trigger `reset_served_at_on_new_items` em `order_items` (after insert) → `UPDATE orders SET served_at = NULL WHERE id = NEW.order_id AND served_at IS NOT NULL`
- Atualizar policy de update em `orders` (já é aberta para POS, sem mudança)

**Editado**: `src/components/palm/TableGrid.tsx`
- Buscar `served_at` no select dos `active-orders`
- Renderizar chip "Servir / Servido" no card
- Handler `handleToggleServed(orderId, currentlyServed)` → update no Supabase + invalidate query
- Lógica de cor inclui novo estado servido

**Editado (opcional, se quiser refletir também)**: `src/components/admin/OrdersTab.tsx`
- Mostrar coluna/badge "Servido às HH:MM" — só leitura. **Vou pular nesta tarefa** para manter escopo enxuto; posso adicionar depois se quiser.

### Detalhes técnicos
- Realtime: já existe canal em `orders` que invalida a query — mudança em `served_at` será refletida automaticamente em todos os Palms abertos.
- Sem mudanças no Kitchen — `served_at` é metadata do garçom, não do fluxo de cozinha.
- Tempo desde servido reaproveita helper `useElapsedTime` já existente.

### Resultado
- Garçom toca "Servir" quando entrega prato → card vira azul, mostra "Servido · 3min"
- Visualmente distingue: vermelho (em produção) vs azul (comendo) vs âmbar (pedindo conta)
- Se chegar nova rodada, mesa volta automaticamente para vermelho até nova servida

