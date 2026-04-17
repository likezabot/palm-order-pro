

## Plano: Subgrupos de Bebidas/Cervejas como pop-ups (modais)

### O que muda no banco (produtos)

**Inserir** (categoria `bebidas`):
- KS Coca-Cola Zero 290ml — R$ 6,00
- KS Coca-Cola Normal 290ml — R$ 6,00

**Inserir** (categoria `cervejas`):
- Outra cerveja — R$ 4,00

**Manter como estão** os demais itens (Coca 220ml normal mantida; Tubaína R$5,00 mantida; Coca 1L vidro e Guaraná 1L mantidos a R$9,00).

### O que muda no app (apenas UI do MenuView do Palm)

Em `src/components/palm/MenuView.tsx`, quando a categoria ativa for `bebidas` ou `cervejas`, em vez de mostrar a grade de produtos, mostro **botões grandes de subgrupo** (quadrados). Ao tocar, abre um **Dialog (pop-up)** com os produtos daquele subgrupo para adicionar ao pedido.

Subgrupos definidos no front (mapeados por nome do produto, sem alterar schema):

**Bebidas**
- KS 290ml → KS Coca-Cola Zero, KS Coca-Cola Normal
- Mini 220ml → Coca 220ml, Coca Zero 220ml, Fanta Uva, Fanta Guaraná (Guaraná 220ml), Fanta Laranja, Sprite 220ml
- Refri 350ml → Coca 350ml, Coca Zero 350ml
- Refri 600ml → Coca 600ml, Coca Zero 600ml, Tubaína 600ml
- Refri 1L → Coca-Cola 1L vidro, Guaraná 1L
- Refri 2L → Coca-Cola 2L, Coca Zero 2L
- Água → Com gás, Sem gás
- Sucos Del Valle 290ml → Maracujá, Pêssego, Uva *(grupo extra para não perder esses itens existentes)*

**Cervejas**
- Cervejas → Skol 600ml, Antarctica Boa 600ml, Original 600ml, Skol 269ml, Outra (R$4,00)

Para `refeicoes` e `espetos`, **mantém o comportamento atual** (grade direta).

### Arquivos alterados

1. **Migration de dados (insert)** — adicionar 3 produtos novos em `products`.
2. **`src/components/palm/MenuView.tsx`** — adicionar:
   - Definição dos subgrupos (constante por categoria com label + lista de nomes/ids).
   - Render condicional: se categoria tem subgrupos, mostrar grade de quadrados de subgrupo; senão, grade de produtos atual.
   - Componente `Dialog` (já disponível em `@/components/ui/dialog`) que abre com a lista de produtos do subgrupo, permitindo adicionar (botão `+ ADD`) sem fechar, com badge de quantidade. Botão "Concluir" fecha o pop-up.

### Regras preservadas

- Nada muda no backend de pedidos, RPC, impressão, bridge, Cashier, Kitchen, Admin.
- Categorias atuais (`bebidas`, `cervejas`) **não mudam** — só a apresentação visual no Palm.
- Produtos existentes continuam ativos.

### Versão

Após a implementação, atualizo a versão visível (build stamp) — o sistema de auto-refresh já cuida disso via `vite.config.ts`.

