# Plano: Balcão Multi-Pedido + Reduzir para 10 Mesas

## Problemas

1. **Balcão** é tratado como mesa única — só mostra 1 pedido. Na prática, o balcão tem vários pedidos simultâneos (cada cliente é um pedido separado).
2. **20 mesas** no grid, mas o restaurante tem no máximo **10**.
3. O ADM não tem acesso a edições de mesas como aumentar ou diminuir ou editar pedidos 

## Solução

### 1. Reduzir mesas para 10

- Alterar `TABLES` de `length: 20` para `length: 10` em `TableGrid.tsx`.

### 2. Balcão como seção separada

Em vez de ser um quadrado no grid, o **BALCÃO** vira uma seção própria no topo com comportamento diferente:

- **Botão grande "NOVO PEDIDO BALCÃO"** — cria pedido avulso no balcão (cada toque = pedido novo, identificado como `BALCÃO #1`, `BALCÃO #2`, etc., ou sequencial por horário).
- **Lista horizontal** dos pedidos ativos do balcão abaixo do botão — cards compactos mostrando:
  - Horário de abertura (ex: "14:32")
  - Valor total
  - Status (badge colorido)
- Ao tocar num pedido existente do balcão → vai para o menu (adicionar itens).

```text
┌─────────────────────────────────┐
│  🏪 BALCÃO                      │
│  [+ NOVO PEDIDO]                │
│  ┌──────┐ ┌──────┐ ┌──────┐    │
│  │14:32 │ │14:45 │ │15:01 │    │  ← scroll horizontal
│  │R$25  │ │R$18  │ │R$42  │    │
│  └──────┘ └──────┘ └──────┘    │
├─────────────────────────────────┤
│  MESAS                          │
│  [1] [2] [3]                    │
│  [4] [5] [6]                    │
│  [7] [8] [9] [10]              │
└─────────────────────────────────┘
```

### 3. Identificação dos pedidos de balcão

- `table_name` no banco será `"BALCÃO"` para todos (sem mudar schema).
- Cada pedido é diferenciado pelo `id` e `created_at`.
- No grid, ao clicar "NOVO PEDIDO", o Palm vai direto para o menu com `tableName = "BALCÃO"`.
- Ao clicar num pedido existente, o sistema carrega aquele pedido específico para edição.
- &nbsp;

## Arquivos a modificar


| Arquivo                             | Mudança                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `src/components/palm/TableGrid.tsx` | Seção Balcão separada com lista de pedidos ativos + botão novo; mesas reduzidas para 10 |
| `src/pages/Palm.tsx`                | Sem alteração significativa (fluxo já funciona)                                         |
