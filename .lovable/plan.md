

# Reposicionar controles (−)/(+)/badge no popup de grupos

## Problema

Hoje, quando `qty > 0`, o lado direito da linha vira uma sequência apertada: `R$ 6,00  (−) ③`. Três elementos com tamanhos e pesos diferentes brigando no mesmo eixo. Visualmente sujo e mobile-hostil — especialmente em alto contraste.

## Nova estrutura visual

Trocar o aglomerado direito por um **stepper coeso e isolado**, alinhado à direita, com o preço passando a viver "encostado" no nome:

```
┌──────────────────────────────────────────────────────┐
│ Água sem gás                                          │
│ R$ 6,00                              [ −   3   + ]   │
└──────────────────────────────────────────────────────┘
```

Quando `qty === 0`:
```
┌──────────────────────────────────────────────────────┐
│ Água sem gás                                R$ 6,00  │
└──────────────────────────────────────────────────────┘
```

### Detalhes

- **Lado esquerdo** vira coluna: nome em cima (`text-[15px]`), preço em baixo (`text-[12px] text-muted-foreground/60 tabular-nums`) — só quando `qty > 0`. Quando `qty === 0`, preço fica à direita como hoje (linha limpa).
- **Lado direito** (apenas quando `qty > 0`): um **stepper pill** unificado:
  - Container: `inline-flex items-center rounded-full border border-border/50 bg-muted/30 h-9 px-1`
  - Botão (−): `h-7 w-7 rounded-full hover:bg-background flex items-center justify-center text-muted-foreground hover:text-foreground`
  - Número: `min-w-[28px] text-center text-[14px] font-medium tabular-nums px-1` (sem círculo preto — agora vive dentro do stepper)
  - Botão (+): mesmo estilo do (−), com ícone `Plus` size 14
- A área de tap principal da linha (`<button>` envolvente) continua somando +1 ao tocar no nome/área vazia, **mas** com `qty > 0` o (+) explícito do stepper já cobre isso de forma mais clara. `e.stopPropagation()` em ambos os botões do stepper.
- Animação: o número anima com `animate-badge-pop` na key change (já existe).

### Mudanças de código

**`src/components/palm/GroupVariantDialog.tsx`**:
- Importar `Plus` além de `Minus`.
- Reestruturar o JSX da linha conforme acima:
  - Esquerda: `<div className="flex flex-col flex-1 min-w-0">` com nome + preço condicional.
  - Direita: se `qty > 0`, renderizar o stepper; senão, renderizar só o preço como hoje.
- Botão (+) chama `onPick(name, product)`, botão (−) chama `onPickDecrement(name, product)`, ambos com `stopPropagation`.
- Esgotado: continua mostrando "indisponível" à direita, sem stepper.

### O que NÃO muda

- `MenuView.tsx` — props já estão prontas (`onPick`, `onPickDecrement`).
- Lógica de adição/remoção, esgotado-confirm, ordenação, header do popup, divisores.
- Cards simples da grade, FAB, runtime, impressão, Telegram.

### Validação

1. `qty === 0`: nome à esquerda, preço à direita (uma linha só, limpa).
2. Primeiro tap (na área da linha): aparece o stepper `[− 1 +]` à direita; preço migra para baixo do nome.
3. Tocar (+) no stepper: vira `[− 2 +]`, número anima.
4. Tocar (−): decrementa; em 0, stepper some e preço volta para a direita.
5. Esgotado: linha esmaecida, "indisponível", sem stepper.
6. Popup permanece aberto em todas as interações.

## Resultado

Controles agrupados num único pill arredondado, com hierarquia clara: nome domina, preço sussurra, stepper isolado e tactile. Acaba o aglomerado `R$ X (−) ③` e dá ar de app premium.

