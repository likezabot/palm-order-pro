

## Aba "Últimos lançamentos" na Home

Adicionar uma seção visual logo abaixo dos botões de modo na tela inicial (`/`) mostrando os itens mais recentes que foram lançados em qualquer pedido aberto, com garçom e tempo decorrido. Apenas leitura, sem afetar o fluxo do POS.

### Comportamento

- **Onde**: nova seção colapsável (fechada por padrão) na home, abaixo dos cards de instalação.
- **Cabeçalho** "Últimos lançamentos" + ícone de relógio. Toca para expandir/recolher.
- **O que mostra**: últimos **30 itens** (linhas de `order_items`) inseridos em pedidos com status `new`, `preparing` ou `done` (mesas abertas).
- **Cada linha exibe**:
  - `2x Bovino` (qtd + nome)
  - Mesa de origem (ex: `Mesa 5` ou `BALCÃO`) em badge pequeno
  - Garçom (`por Wilson`) em texto cinza
  - Tempo decorrido (`5min`, `1h12`) à direita, usando o hook `useElapsedTime` que já existe
- **Atualização**: refetch a cada 15s via `setInterval` enquanto a seção está aberta. Sem realtime/subscriptions para manter leve.
- **Estado vazio**: "Nenhum pedido em andamento."

### Limitação técnica conhecida

A tabela `order_items` **não tem `created_at`**. Para ordenar por "mais recente" usaremos o `updated_at` do pedido pai como aproximação:

1. Buscar últimos 20 pedidos ativos ordenados por `updated_at desc`.
2. Para cada um, puxar seus `order_items` (já vêm em uma única query com `select=...,order_items(*)`).
3. Achatar tudo em uma lista linear, mostrar os 30 primeiros itens (pedido mais recente primeiro, depois itens dentro do pedido na ordem que vieram).
4. O "tempo decorrido" exibido é o do **pedido**, não do item individual — isso é aceito pois batch de itens chega junto e não há timestamp por item.

Isso é mencionado em uma nota visual discreta? Não — fica transparente para o usuário, comportamento "natural".

### Arquivos afetados

- **Novo**: `src/components/home/RecentItemsPanel.tsx` — componente da seção, fetch + render + expand/collapse com `useState`.
- **Editado**: `src/pages/Index.tsx` — importar e renderizar `<RecentItemsPanel />` ao final do conteúdo.

Reusa: `useElapsedTime` (já existe), tokens de design já usados na home (`bg-card`, `border-border`, `text-muted-foreground`), `lucide-react` ícones (`Clock`, `ChevronDown`).

Sem mudança de banco. Sem mudança de tipos. Só leitura via `supabase.from('orders').select('id, table_name, waiter_name, updated_at, status, order_items(product_name, quantity, waiter_name)').in('status', ['new','preparing','done']).order('updated_at', { ascending: false }).limit(20)`.

