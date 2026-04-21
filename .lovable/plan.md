

## Limpeza dos dados de hoje + mover "Últimos lançamentos" para o Palm

### Parte 1 — Limpar dados de hoje (sem afetar estatísticas)

**Estado atual no banco**
- 23 pedidos criados hoje (16 pagos, 7 ativos).
- Estatísticas históricas devem ficar intactas — só queremos zerar o "dia".

**Estratégia: hard delete dos pedidos de hoje**
Como as estatísticas (StatsPanel/admin) são calculadas **a partir de `orders.created_at`**, "não entrar na conta" = remover esses pedidos de hoje completamente. Não há tabela separada de histórico/estatísticas — tudo é derivado. Então:

- Migração SQL one-shot que apaga:
  - `order_items` cujos `order_id` pertencem a pedidos com `created_at::date = CURRENT_DATE` (timezone do servidor).
  - `orders` com `created_at::date = CURRENT_DATE` (todos os status: new, preparing, done, paid).
  - `cash_movements` criados hoje (pra não ter saldo "fantasma" no caixa do dia).
  - `cash_register` aberto hoje volta ao estado limpo (fecha registros abertos de hoje).
- Não toca em `products`, `profiles`, `settings`, `stock_movements`.
- Não toca em pedidos de dias anteriores (estatísticas históricas preservadas).

A migração roda **uma vez** no momento da aprovação. Não fica no app como botão recorrente.

### Parte 2 — Mover "Últimos lançamentos" para o Palm

**Local atual**: `RecentItemsPanel` aparece em `src/pages/Index.tsx` (Home).
**Novo local**: Dentro da `TableGrid` (Palm), no header — um **ícone de relógio discreto** ao lado do botão "NOVO PEDIDO" (BALCÃO).

**Mudanças**
- **`src/pages/Index.tsx`**: remove `<RecentItemsPanel />` e seu import.
- **`src/components/palm/TableGrid.tsx`**:
  - Importar `Clock` (já importado) e o `RecentItemsPanel`.
  - Adicionar pequeno botão ícone-only `Clock` (24×24, `text-muted-foreground`, sem borda) **inline ao lado direito** do título "BALCÃO" no header da seção (linha 271-274), ou acima do botão "NOVO PEDIDO".
  - Clicar abre um **Sheet/Drawer** (lateral ou bottom sheet) com o `RecentItemsPanel` embutido, sem ocupar espaço fixo da tela.
- **`RecentItemsPanel`**: mínima refatoração — atualmente é um `Collapsible` com botão próprio. Vamos extrair o **conteúdo da lista** (a parte do `fetchItems` + render) e usar dentro do Sheet, sem o trigger expansível duplicado. Mantém o componente original funcionando (caso queira reusar) mas exporta também `<RecentItemsList />`.

**Por que Sheet e não inline**: o Palm já é denso (header + balcão + grid de mesas). Um painel expansível inline empurraria a grade pra baixo. Sheet abre por cima, fecha rápido — combina com "discreto".

### Arquivos
- **Migração SQL** (criada e executada uma vez): apaga pedidos/items/movimentos de hoje.
- **Editado** `src/pages/Index.tsx` — remove `RecentItemsPanel`.
- **Editado** `src/components/home/RecentItemsPanel.tsx` — exporta `RecentItemsList` (só o conteúdo) além do componente atual.
- **Editado** `src/components/palm/TableGrid.tsx` — adiciona ícone `Clock` discreto ao lado do "BALCÃO" + Sheet com a lista.

### Resultado
- Dia "zerado": grade do Palm vazia, sem pedidos pendentes, sem movimentos de caixa de hoje. Estatísticas dos dias anteriores intactas.
- Home mais limpa (sem o painel de lançamentos).
- No Palm, o garçom toca no relógio discreto ao lado de "BALCÃO" → abre painel lateral com os últimos lançamentos.

