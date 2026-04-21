

## Caixa — painel de mesas em cards completos

Refatorar a aba **Caixa** (`src/pages/Cashier.tsx`) para um painel visual de mesas em grid, com cards autoexplicativos e ações rápidas inline. Sem alterar banco, RPCs, realtime, impressão ou fluxo de pagamento.

### 1. Grid responsivo

- `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4` (já parcial — aumentar gap e garantir altura uniforme com `auto-rows-fr`).
- Cards com altura mínima consistente (`min-h-[200px]`) para parecerem "blocos de mesa" robustos.

### 2. Estrutura do card (3 zonas)

**Topo** (linha 1):
- Nome da mesa em destaque (`text-2xl font-black`) + subtítulo "(Mesa X)" se renomeada.
- Badge de **status do pedido** à direita, baseado em `order.status`:
  - `new` → chip azul "NOVO" (`bg-blue-500/15 text-blue-400 border-blue-500/30`)
  - `preparing` → chip laranja "EM PREPARO" (`bg-warning/15 text-warning border-warning/30`)
  - `done` → chip verde "PRONTO" (`bg-success/15 text-success border-success/30`)
- Badge secundário de **impressão** (linha abaixo do status, menor):
  - `printed` → "✓ Impresso" verde discreto
  - `failed` → "⚠ Falha" vermelho discreto
  - `pending`/`printing` → "Aguardando" cinza

**Meio** (resumo):
- Linha com ícone `Users` + nome do garçom (se existir).
- Linha com ícone `Package` + contador de itens (busca via query adicional `order_items` agrupada — uma única query `.in("order_id", ids)` para evitar N+1).
- Linha com ícone `Clock` + tempo decorrido (usa hook existente `useElapsedTime`).

**Base** (valor + ações):
- Total grande: `R$ XX,XX` em `text-3xl text-primary font-black`.
- Linha de ações compacta:
  - Botão ícone **Imprimir** (`Printer`) — chama `manualPrintOrder` (mantém atual).
  - Botão ícone **Editar** (`Pencil`) — navega para `/palm` (mantém atual).
  - Botão ícone **Avançar status** (`ChevronRight`) — só aparece se `status !== "done"`; chama `supabase.rpc("update_order_status", { p_order_id, p_status: next })` onde next = `new→preparing→done`. Mostra toast de confirmação.
  - Botão principal **FECHAR** (gradient brasa, flex-1) — abre `CloseOrder` (mantém atual).

### 3. Estados visuais

- Card hover: `hover:border-primary/40 hover:shadow-glow transition-all`.
- Card de pedido **PRONTO** (`status === "done"`): borda esquerda destacada `border-l-4 border-l-success` para ganhar atenção do operador.
- Card com falha de impressão: borda esquerda `border-l-4 border-l-destructive`.
- Tap no corpo do card (área não-botão) → seleciona e abre `CloseOrder` (mesmo destino do FECHAR), reduzindo cliques.

### 4. Dados extras necessários

Adicionar **uma query única** para contar itens por pedido sem alterar schema:
```ts
const { data: itemCounts } = useQuery({
  queryKey: ["cashier-item-counts", orders.map(o => o.id)],
  queryFn: async () => {
    const { data } = await supabase
      .from("order_items")
      .select("order_id, quantity")
      .in("order_id", orders.map(o => o.id));
    // reduce → Map<order_id, totalQty>
  },
  enabled: orders.length > 0,
});
```
Atualiza junto do `refetchInterval: 5000` existente.

### 5. Responsividade

- 320–639px: 1 coluna.
- 640–1023px: 2 colunas.
- 1024–1279px: 3 colunas.
- ≥1280px: 4 colunas.
- `gap-4` (16px) com `p-4` no container.

### 6. Comportamento preservado

- ✅ Realtime: `refetchInterval: 5000` mantido (e Realtime de `usePdvRealtime` não é usado aqui — Caixa usa polling, igual antes).
- ✅ Pagamento: `CloseOrder` + RPC `pay_order` intactos.
- ✅ Impressão: `manualPrintOrder` intacto.
- ✅ Edição: navegação `/palm?orderId=...` intacta.
- ✅ Tema dark + paleta atual (laranja brasa).

### Arquivos afetados (1)

- `src/pages/Cashier.tsx` — refatoração visual + nova query de contagem de itens + handler de avanço de status.

### Sem alterações
- Banco, RPCs, edge functions, `CloseOrder.tsx`, `print-service.ts`, `usePdvRealtime`, fluxo Palm.
- Sem dependências novas.

### Resultado esperado

Painel de mesas em grid 1/2/3/4 colunas; cada card mostra **mesa, status (NOVO/PREPARO/PRONTO), itens, garçom, tempo decorrido, valor em destaque e impressão**; ações rápidas (imprimir, editar, avançar status, fechar) embutidas no card; tap no corpo abre o fechamento. Pagamento, impressão e atualização em tempo real continuam funcionando exatamente como antes.

