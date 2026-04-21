

## Caixa e PDV — grid unificado de pedidos com marcador de "feito"

Simplificar as listas de pedidos no **Caixa** e no **PDV**: remover a separação por status (Aguardando / Em Preparo / Prontos p/ Pagamento) e exibir todos os pedidos abertos juntos em **layout de grade (colunas)** em vez de lista vertical. Adicionar um **marcador visual** indicando que o pedido já foi feito/enviado (impresso na cozinha).

Sem mudar lógica, banco, RPCs, fluxo de pagamento ou impressão.

### 1. `src/pages/Cashier.tsx` — Caixa

**Remoção:**
- Não há discriminação por status hoje (já é uma lista única) — manter assim. O texto do usuário "não precisa aparecer isso na aba de caixa" se aplica a remover qualquer aparência de status: garantir que **não exibe** badges de "AGUARDANDO/PRONTO" (já não exibe).

**Mudança de layout (lista → grade):**
- Container atual `space-y-3` → `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`.
- Cards passam de "linha horizontal" (`flex justify-between`) para **card vertical compacto**:
  - Topo: nome da mesa em destaque (`text-2xl font-black`).
  - Meio: total grande em laranja (`text-primary text-2xl`).
  - Rodapé: 3 botões em linha (Imprimir, Editar, **FECHAR** principal).
- Mantém `border-2 border-border bg-card rounded-xl shadow-sm` + `hover:border-primary/40 transition-colors`.

**Marcador "pedido feito":**
- Quando `order.print_status === "printed"`: adicionar chip pequeno no canto superior direito do card com `CheckCircle2` verde + texto **"FEITO"** (`bg-success/15 text-success border border-success/30 rounded-full px-2 py-0.5 text-xs font-bold`).
- Quando `pending`: nenhum chip (silencioso).
- Quando `failed`: chip vermelho discreto **"⚠ FALHA"** (mesmo estilo, cor destructive) — opcional mas útil para o caixa saber.

### 2. `src/pages/Pdv.tsx` — PDV

**Remoção da discriminação por status:**
- Remover as 3 chamadas a `<OrderSection>` (Aguardando / Em Preparo / Prontos p/ Pagamento).
- Remover o uso de `groupedOrders` na render (manter o `useMemo` se quiser, mas não usar) — ou eliminar para limpeza.
- Remover o hook de som "novo pedido pronto" (`prevDoneIdsRef` + `useEffect`)? **Manter** — é feedback útil e não depende da exibição visual; só não emite mais o toast com nome de seção. *(Optar por manter intacto para preservar comportamento.)*

**Mudança de layout (lista vertical agrupada → grade única):**
- O painel esquerdo passa a renderizar **um único grid** com todos os pedidos ordenados por `created_at` ascendente (mais antigo primeiro):
  ```
  grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3
  ```
- Cada card usa o componente atual `OrderRow` adaptado para modo "card" (ver item 3) — ou criar `OrderCard` novo reusando o mesmo arquivo via prop `variant="card"`.
- Header da seção vira simples: **"Fila de Pedidos (N)"** sem subtítulos por status.

**Marcador "pedido feito":**
- O card de pedido continua mostrando o `CheckCircle2` que `OrderRow` já renderiza quando `print_status === "printed"`, mas agora com **chip explícito "FEITO"** em vez de só ícone, no topo do card.
- Manter `print_status` no painel direito (já existe — Aguardando impressão / Impresso às HH:MM / Falha).

### 3. `src/components/pdv/OrderRow.tsx` — adaptação para grade

Refatorar para suportar layout de **card** (não só linha):
- Remover dependência de `flex items-center justify-between` horizontal → mudar para `flex flex-col gap-2 p-3` (vertical).
- Hierarquia dentro do card:
  - **Topo**: nome da mesa grande + chip "FEITO" à direita se impresso.
  - **Meio**: contador de itens · garçom (texto pequeno) + tempo decorrido em chip.
  - **Inferior**: total à direita em destaque + badges de urgência abaixo se aplicável.
- Manter todos os estados visuais existentes: `selected`, `isUrgent` (animate-pulse + borda destrutiva), `isLate`, `waitingPay`.
- Manter borda lateral colorida (`border-l-4`) — agora indicando idade/urgência apenas (não status), pois `OrderSection` é removida.
- Como `OrderSection` deixa de ser usada no PDV, o prop `accentBorder` recebe um valor padrão calculado dentro do próprio `OrderRow`:
  - normal → `border-l-border`
  - urgente → `border-l-destructive`
  - atrasado → `border-l-warning`
  - waitingPay → `border-l-warning`

### 4. `src/components/pdv/OrderSection.tsx`

- **Não deletar** o arquivo (evita quebrar imports/testes em outros lugares se houver), mas o PDV deixa de importá-lo. Marcar como "deprecated" via comentário no topo:
  ```ts
  // DEPRECATED: agora o PDV usa um grid único de OrderRow.
  ```

### 5. Comportamento preservado (sem mudanças)

- Banco, RPCs (`pay_order`), realtime (`usePdvRealtime`), impressão (`manualPrintOrder`/`Delta`/`Bill`), fluxo de pagamento, identificação do cliente, modo garçom (`staffMode`), confirmação de impressão.
- Painel direito do PDV (detalhes do pedido + botões de ação): inalterado.
- Tela `CloseOrder`: inalterada.
- Som ao novo pedido pronto: inalterado.
- Ordem de exibição: mais antigo primeiro (FIFO), igual ao atual após remover agrupamento.

### Arquivos afetados (3)

- `src/pages/Cashier.tsx` — grid + chip "FEITO".
- `src/pages/Pdv.tsx` — remover seções por status, usar grid único.
- `src/components/pdv/OrderRow.tsx` — refatorar para layout de card vertical, calcular borda interna, exibir chip "FEITO".

### Resultado esperado

- **Caixa**: mesas abertas em grade responsiva (1 col mobile → 4 col desktop), cards compactos com mesa, total e ações; chip verde "FEITO" quando o cupom da cozinha já saiu.
- **PDV**: mesma fila visualmente uniforme — sem títulos "Aguardando / Em Preparo / Prontos" — apenas cards ordenados por chegada, em grid (1/2/3 colunas conforme largura), com marcadores de urgência e "FEITO" preservando hierarquia.
- Zero impacto em comportamento, dados ou fluxo de pagamento/impressão.

