

# Correção estrutural dos controles de quantidade nos cards do cardápio

## O que causa o bug hoje

No `MenuView.tsx`, o card simples usa **3 elementos com `position: absolute`** sobrepostos ao conteúdo:

1. Badge de quantidade no `top-2 right-2` (canto superior direito).
2. Botão (−) no `top-2 left-2` (canto superior esquerdo) — **invade o nome do produto**, que começa também no topo.
3. Linha lateral decorativa em `left-0 top-0 bottom-0`.

Como o nome ocupa o topo do card sem padding lateral reservado, o (−) literalmente cobre as primeiras letras em nomes longos, e o badge fica "colado" no canto sem ancoragem visual. O resultado parece um adesivo solto, não um componente.

O mesmo padrão existe no card de **grupo** (badge absoluta no top-right + chevron `›` no bottom-right), que sofre do mesmo problema visual em menor grau.

## Nova estrutura do card (3 zonas explícitas)

```text
┌──────────────────────────────┐
│ TOPO                         │ ← nome (livre, sem overlay)
│ Espeto de Picanha            │
│                              │
│ MEIO                         │ ← preço
│ R$ 18,00                     │
├──────────────────────────────┤
│ BASE — área de ações fixa    │ ← controle de quantidade
│ [ − ]   2   [ + ]            │
└──────────────────────────────┘
```

- Container do card vira `flex flex-col` com 3 áreas: topo (`flex-1` para nome), meio (preço), base (ações).
- A base sempre reserva espaço (`min-h` fixo), mesmo quando `qty === 0`, para todos os cards manterem altura consistente.
- **Zero `absolute`** sobre o conteúdo. A barra lateral de "selecionado" continua, pois fica na borda esquerda fora da área de texto.

## Comportamento dos dois estados

### Estado A — `qty === 0` (não adicionado)
- O card inteiro continua clicável e adiciona +1 (comportamento atual preservado).
- Na base do card aparece um **rótulo discreto** "Adicionar" alinhado à direita com um `+` pequeno, deixando claro o affordance sem virar um botão pesado:
  ```
  Adicionar  +
  ```
- Toque em qualquer lugar do card = adiciona. Mantém a UX "card-as-button" atual.

### Estado B — `qty > 0` (já no carrinho)
- O card inteiro **deixa de ser clicável** para adição direta. A área de ações vira o ponto de interação.
- Na base aparece o **stepper horizontal**:
  ```
  [ − ]   2   [ + ]
  ```
  - `−` à esquerda: `h-9 w-9 rounded-lg bg-secondary/60`, ícone `Minus 14px`.
  - Contador central: `text-sm font-semibold tabular-nums text-foreground`, com `min-w-[24px]` para não pular layout.
  - `+` à direita: `h-9 w-9 rounded-lg bg-foreground text-background`, ícone `Plus 14px` — destaque visual maior, é a ação primária.
- Cada botão tem `e.stopPropagation()` e seu próprio `onClick`. Nada mais flutua.
- Badge solta no canto superior **some** — a quantidade já vive dentro do stepper, sem duplicação.

## Cards de grupo

Mesmo tratamento na base, mas como grupo abre popup (não soma direto):
- `qty === 0`: rótulo "Ver opções ›" na base.
- `qty > 0`: rótulo "X no carrinho ›" na base, sem stepper (decremento de grupo é feito dentro do popup, que já tem o (−) por variante).
- Badge top-right do grupo é removida — a contagem fica integrada no rótulo da base.

## Estilos e tokens

- Card: `min-h-[140px]` (cresce de 112 para acomodar a base com folga), `p-4 pb-3`, `flex flex-col gap-2`.
- Área de ações: `mt-auto pt-2 border-t border-border/30 flex items-center justify-between`.
- Stepper: container `flex items-center gap-2`, botões com `active:scale-90 transition-transform`.
- Tudo usa tokens semânticos (`bg-secondary`, `bg-foreground`, `text-background`, `border-border`) — funciona idêntico em tema claro, escuro e modo Alto Contraste (que reforça bordas para 2px automaticamente).

## Acessibilidade

- Estado A: `<button>` externo com `aria-label="Adicionar X — R$ Y"` (atual).
- Estado B: card vira `<div>` (não-clicável), e os 3 controles internos são `<button>`s com `aria-label="Diminuir X"`, `aria-label="Quantidade: 2"` (status), `aria-label="Adicionar mais um X"`.
- Foco visível mantido (ring herdado do `.hc` no modo alto contraste).

## Esgotado

- `qty === 0` + esgotado: card opacificado, base mostra "Esgotado" em `text-muted-foreground` no lugar de "Adicionar".
- Toque continua disparando o `EsgotadoConfirmDialog` atual.
- Se confirmar e `qty > 0`, stepper aparece normalmente.

## Arquivos modificados

**Único arquivo:**
- `src/components/palm/MenuView.tsx` — refatorar o JSX do card simples (linhas ~394-448) e do card de grupo (linhas ~354-390). Lógica (`handleAdd`, `onDecrement`, `getQty`, `getGroupQty`) **permanece intacta**.

## O que NÃO muda

- `GroupVariantDialog` (já corrigido nas iterações anteriores, com (−) por variante).
- Hooks, queries, estoque, esgotado, ordenação, busca, tabs, FAB, `OrderReview`, `CartItemRow`, runtime global, impressão, Telegram, banco.
- Tokens de cor, paleta brasa, tipografia, animações.
- Comportamento do popup de grupos (escala múltiplas adições).

## Validação visual (mobile 441×754)

1. Item curto, `qty === 0`: nome no topo livre, preço no meio, "Adicionar +" na base.
2. Item com nome longo (2 linhas), `qty === 0`: nome ocupa as 2 linhas sem nenhum botão por cima.
3. Mesmo item, após tap → `qty === 1`: nome continua intacto, base mostra `[ − ] 1 [ + ]`.
4. Tocar `+` 3× → `[ − ] 4 [ + ]`, contador atualiza com `tabular-nums` (sem pulo).
5. Tocar `−` até 0: stepper some, volta o "Adicionar +".
6. Card de grupo `qty === 0`: "Ver opções ›" na base, sem badge canto superior.
7. Card de grupo `qty > 0`: "3 no carrinho ›" na base.
8. Esgotado: card esmaecido, base mostra "Esgotado".
9. Alto Contraste ligado: bordas 2px, stepper continua proporcional.
10. Tema claro e escuro: visual idêntico em estrutura.

## Resultado

Cards com 3 zonas claras, **zero overlay sobre conteúdo**, controle de quantidade ancorado na base como componente íntegro. Nome do produto sempre 100% visível. Layout estável independente do estado (qty 0 ou qty > 0). Visual limpo, profissional e consistente em todos os cards do cardápio.

