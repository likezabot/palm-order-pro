
## Fix: scroll do pedido no OrderReview

A barra inferior (Total + Acréscimo/Pedido/Conta + Fechar Conta + Atualizar Pedido) está cobrindo os últimos itens da lista. Precisamos travar essa barra no rodapé e dar scroll só na lista de itens.

### Mudanças em `src/components/palm/OrderReview.tsx`

1. **Layout em coluna fixa de altura cheia**
   - Container raiz: `h-[100dvh] flex flex-col` (em vez do scroll global da página).
   - Header (mesa/garçom/voltar): `shrink-0`.
   - Lista de itens: `flex-1 overflow-y-auto` com `pb-4` para respiro.
   - Footer (Total + 3 botões + Fechar/Atualizar): `shrink-0` com `border-t` e `bg-background` para destacar da lista.

2. **Safe area mobile**
   - Adicionar `pb-[env(safe-area-inset-bottom)]` no footer para não ficar atrás da barra de gestos do Android/iOS.

3. **Sem mudanças de comportamento**
   - Botões, totais, lógica de acréscimo/conta/fechar permanecem iguais.
   - Apenas reorganização de containers e classes Tailwind.

### Arquivos
- `src/components/palm/OrderReview.tsx` — único arquivo afetado.

### Notas
- Não mexe em `MenuView` nem em `OrderSuccess`.
- Mantém visual atual (cards escuros, laranja brasa).
- Funciona em qualquer altura de viewport (testado mentalmente em 441×754).
