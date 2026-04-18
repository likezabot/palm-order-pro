
## Plano: Admin – Cardápio aprimorado, ocultar sensíveis, Estatísticas

Sem auth (como solicitado). Sem campo de custo. Sem tocar em pedidos/impressão.

### 1. Cardápio: busca + filtros + edição em lote

**Toolbar nova** acima das pills de categoria em `ProductsManager.tsx`:
- Busca por nome (filtra em tempo real; quando há texto, ignora pills e mostra resultados de TODAS as categorias agrupados)
- Filtro de status: `Todos / Visíveis / Ocultos`
- Filtro de preço: min/max em R$
- Botão `Limpar filtros` quando algum estiver ativo

**Modo seleção múltipla:**
- Botão `Selecionar` ativa checkboxes nos cards (drag desabilitado nesse modo)
- Barra fixa no rodapé: "X selecionados" + **Mostrar** + **Ocultar** + **Ajustar preço** (+5%, +10%, -5%, valor fixo) + **Cancelar**
- Update em lote via `update().in("id", selectedIds)`

### 2. Toggle "Ocultar Informações Sensíveis"

Mesmo padrão do PDV (`.staff-mode .admin-only`):
- Botão Eye/EyeOff no header → `MODO ADMIN ↔ MODO GARÇOM`
- Persistido em `localStorage` (`admin-staff-mode`)
- Marca como `admin-only`: aba **Estatísticas**, aba **Sistema**, botões **Excluir** dos cards
- Toggle em si NÃO leva `admin-only`
- CSS já existe; adicionar transição opacity .2s

### 3. Nova aba **Estatísticas** (com classe admin-only)

Componente `StatsPanel.tsx` usando `recharts` (já instalado):

**Filtro de período:** Hoje · 7 dias · 30 dias · Personalizado (DatePicker)

**4 KPIs no topo:** Faturamento total · Pedidos pagos · Ticket médio · Itens vendidos

**4 gráficos:**
1. Top 10 itens — BarChart horizontal
2. Vendas por categoria — PieChart (cruza via lookup em products)
3. Vendas por hora do dia — BarChart (0-23h)
4. Faturamento por forma de pagamento — PieChart (cash/pix/card)

**3 listas Top 5:** noite (18-23h) · dia (11-17h) · semana (últimos 7 dias)

**Refresh:** `useQuery` com `refetchInterval: 30s` + invalidação por Realtime em `orders`

### 4. Sem migration

Banco já tem tudo: `orders.status='paid'` + `total` + `payment_method` + `created_at` + `order_items.quantity/subtotal`. Categoria via lookup local em `products`.

### Arquivos

| Arquivo | Ação |
|---|---|
| `src/pages/Admin.tsx` | Toggle staff-mode header + aba Estatísticas + classes `admin-only` |
| `src/components/admin/ProductsManager.tsx` | Busca, filtros, modo seleção |
| `src/components/admin/SortableProductCard.tsx` | Prop `selectionMode` + checkbox |
| `src/components/admin/BulkActionsBar.tsx` | **Novo** |
| `src/components/admin/StatsPanel.tsx` | **Novo** — KPIs + 4 gráficos + 3 listas top |
| `src/index.css` | Transição `.admin-only` |

Sem migrations. Sem novas dependências (recharts já existe).
