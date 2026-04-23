

# Adicionar botão (−) nas variantes do popup de grupos

## O que muda

No `GroupVariantDialog`, cada linha de variante passa a ter o mesmo controle dos cards simples: quando `qty > 0`, aparece um botão (−) discreto ao lado da badge preto/branco, permitindo decrementar sem fechar o popup.

## Comportamento

- `qty === 0`: linha mostra só nome + preço (como hoje).
- `qty > 0`: linha mostra nome + preço + botão (−) + badge preto/branco com a quantidade.
- Tap na linha (área principal): soma +1 (comportamento atual preservado).
- Tap no botão (−): subtrai 1. Quando chega a 0, o (−) e a badge somem juntos.
- Popup permanece aberto em ambos os casos — fecha só por X / tap fora / Esc.
- Esgotado e não-cadastrado seguem bloqueados.

## Mudança técnica

**`src/components/palm/MenuView.tsx`** — passar nova prop `onPickDecrement` ao `GroupVariantDialog`:
```ts
onPickDecrement={(_name, product) => onDecrement(product)}
```
(`onDecrement` já existe no escopo do `MenuView`, vindo de `Palm.tsx` via `updateQuantity(product.id, -1)`.)

**`src/components/palm/GroupVariantDialog.tsx`**:
- Nova prop opcional `onPickDecrement?: (name: string, product: Product) => void`.
- Em cada linha com `qty > 0`, renderizar antes da badge um botão `(−)` no mesmo estilo do botão de decremento dos cards: `h-6 w-6 rounded-full bg-background/80 border border-border/40`, ícone `Minus size={12}` em `text-muted-foreground`.
- `e.stopPropagation()` no `onClick` do (−) para não disparar o tap da linha (que somaria +1).
- Linha continua clicável para somar +1 (área do nome/preço).

## Layout da linha (qty > 0)

```
┌────────────────────────────────────────────┐
│ Água sem gás              R$ 6,00  (−) ③  │
└────────────────────────────────────────────┘
```

## O que NÃO muda

- Lógica de `handleAdd`, `onPick`, `getQty`, esgotado-confirm.
- Cards simples, busca, tabs, FAB, runtime global, impressão, Telegram.
- Estilo geral do popup (header, divisores, tipografia).

## Arquivos modificados

- `src/components/palm/MenuView.tsx` — passar `onPickDecrement`.
- `src/components/palm/GroupVariantDialog.tsx` — receber prop, renderizar botão (−) condicional.

## Validação

1. Abrir grupo "Água", tocar 3× em "Água sem gás" → badge ③, botão (−) visível.
2. Tocar 1× no (−) → badge ②, popup permanece aberto.
3. Tocar até 0 → (−) e badge somem; só nome + preço.
4. Tap na área da linha continua somando +1.
5. Esgotado: linha desabilitada, sem (−).

