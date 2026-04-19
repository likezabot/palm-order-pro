
## Expandir aba de Estatísticas — foco em garçons

### O que adicionar

**1. Card de destaque "Garçom do dia/período"**
- Mostra o top 1 com avatar/inicial, total vendido, nº de itens e % do faturamento total.

**2. Ranking expandido (tabela "Vendas por garçom")**
Colunas atuais: nome, itens, total, médio/item.
Adicionar:
- **Pedidos atendidos** (nº de mesas distintas em que o garçom adicionou itens)
- **Ticket médio por mesa** (total ÷ mesas distintas)
- **% do faturamento** (barra de progresso visual)
- **Top categoria** (categoria mais vendida por aquele garçom — ex: "Cervejas")
- Ordenação clicável por coluna

**3. Gráfico "Vendas por garçom ao longo do dia"**
- Barras empilhadas por hora, cada cor = um garçom
- Mostra picos de produtividade de cada um
- Reaproveita o filtro de período já existente

**4. Top 3 itens por garçom (mini-cards)**
- Quando um garçom é selecionado no filtro, mostra os 3 produtos que ele mais vende
- Quando "Todos", mostra um card por garçom com seu top item

**5. Comparação rápida (chips de KPI no topo do bloco de garçons)**
- Total de garçons ativos no período
- Média de vendas por garçom
- Diferença % entre o 1º e o 2º colocado

**6. Exportar CSV**
- Botão "Exportar ranking" → baixa CSV com todas as colunas do ranking + período selecionado.

### Arquivos
- `src/components/admin/StatsPanel.tsx` — toda a lógica de agregação e UI nova
- (sem mudanças de banco — tudo é derivado de `order_items.waiter_name`)

### Notas
- Reutiliza `filteredOrders` e `availableWaiters` já existentes.
- Para "top categoria por garçom", precisamos cruzar `order_items.product_id` → `products.category` (já carregado no painel).
- Mobile: ranking vira cards empilhados abaixo de 640px; gráfico empilhado mantém scroll horizontal se necessário.
- Sem novas dependências — usa Recharts (já no projeto) e componentes shadcn existentes.
