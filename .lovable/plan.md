

# Cardápio premium v2 — refinamento visual completo

## Visão geral

A v1 já removeu os botões "Adicionar" e "Ver opções" e tornou o card todo clicável — isso fica. O que ainda peca: cards quadrados com ar "ecommerce", densidade visual alta, tabs com sublinhado laranja muito presente, popup de grupos com tipografia pesada, badges e price tags brigando com o nome. Esta v2 reconstrói a hierarquia, o respiro e o acabamento.

## Princípios de design

- **Hierarquia clara**: nome > preço > qty > controles. Preço perde força (cor `muted`, peso normal, tamanho menor).
- **Respiro**: padding interno maior, gap entre cards maior, cards mais altos.
- **Brasa só onde importa**: laranja reservado ao FAB do carrinho, à badge de qty e ao indicador de tab ativa (mais fino e curto). Tudo o mais é neutro.
- **Sombras quase imperceptíveis** + bordas finas em cor neutra; remover hover-shadow agressivo.
- **Tipografia**: nome em `font-medium tracking-tight` (não semibold), preço em `text-[13px] text-muted-foreground/80 tabular-nums`.

## 1. Tabs de categoria (mais leves)

- Remover qualquer destaque de fundo no estado ativo.
- Indicador ativo: barra de **2px** centralizada de **20px de largura** (não estende de borda a borda), em `bg-foreground` (não gradiente brasa) — sensação editorial discreta.
- Texto ativo: `text-foreground font-medium`, inativo: `text-muted-foreground/60 font-normal`.
- Espaçamento maior entre tabs (`px-4 py-3`), borda inferior do container mais sutil (`border-border/30`).
- Badge de contagem: chip pequeno `h-[16px] min-w-[16px] text-[10px] bg-foreground/8 text-foreground/70` — sem brasa.

## 2. Campo de busca (integrado)

- Sem borda visível em estado normal — usar só `bg-secondary/40` (preenchimento sutil) com `border-transparent`.
- No foco: borda fina `border-foreground/15` aparece, sem ring laranja.
- Ícone `Search` em `text-muted-foreground/40`, mais leve.
- `rounded-xl` (em vez de `2xl`) para parecer mais editorial e menos "pill de app comum".
- Placeholder mais curto e neutro: "Buscar no cardápio".

## 3. Grade de cards (novo layout)

- Grid: `grid-cols-2` fixo no mobile (em vez de `auto-fill minmax(150px)` que dá larguras irregulares). Em telas ≥640px: 3 colunas.
- Gap: `gap-3` (era 2). Padding do container: `p-3.5`.
- Card altura mínima: `min-h-[112px]` (era 96), `p-4`.
- Borda: `border border-border/40` em estado neutro; nada de hover-shadow no mobile (tap não usa hover).
- Cantos: `rounded-2xl` (mantém).
- Estado com qty > 0: borda muda para `border-foreground/20` + faixa fina à esquerda de 2px em `bg-primary/60` (acento sutil) — substitui o `bg-primary/[0.04]` que dava cara de "selecionado de formulário".

### Card de item simples
```
┌──────────────────────────┐
│ (-)                  ④  │  ← controles flutuantes
│                          │
│  Nome do item            │  ← font-medium, text-[15px], leading-snug
│                          │
│  R$ 30,00                │  ← text-[13px] muted, tabular-nums
└──────────────────────────┘
```

### Card de grupo
- Idêntico ao simples visualmente. Indicador de variante: **um único ponto** (•) ou um chevron `›` muito discreto em `text-muted-foreground/30` no canto inferior direito. Sem "+N", sem "a partir de", sem texto auxiliar.
- O preço mostrado é o do trigger (sem rótulo "a partir").

### Estado esgotado
- `opacity-50`, sem palavra "indisponível" inline (badge sutil `text-[10px] text-muted-foreground/50` no rodapé só se necessário). Tap continua bloqueado com confirm.

### Botão (−)
- Permanece no canto superior esquerdo, **só com qty > 0**.
- Mais discreto: `h-6 w-6`, `bg-background/80 backdrop-blur`, sem borda, ícone `Minus size={12}` em `text-muted-foreground`. Sem ring.

### Badge de qty
- Canto superior direito, `h-5 min-w-[20px] text-[10px]`, `bg-foreground text-background` (preto/branco em vez de laranja) — sensação editorial. Sem ring, sem `-top-1.5 -right-1.5` saliente: alinhada `top-2 right-2` dentro do card.

## 4. Popup de grupos (refinamento)

Mantém Dialog central (não vira sheet — dialog dá ar mais "boutique"; sheet daria ar mais comum).

- `max-w-sm`, `rounded-3xl`, `p-6` (mais respiro).
- Header:
  - Eyebrow "Escolha uma opção" → **remover** (ruído).
  - Título: `text-[22px] font-medium tracking-tight` (não semibold).
  - Adicionar separador fino abaixo do título com `mt-3 border-b border-border/30`.
- Lista:
  - `divide-y divide-border/20` (mais sutil).
  - Cada linha: `py-4 px-1`, sem `active:scale` (lista, não card).
  - Layout: nome à esquerda em `text-[15px] font-normal text-foreground`, à direita preço em `text-[13px] text-muted-foreground/70 tabular-nums` + (se qty > 0) badge preto/branco pequena.
  - Esgotado: linha em `opacity-40`, com micro-label "indisponível" `text-[11px]` à direita em vez de no meio.
  - Não-cadastrado: mesma linha-padrão, label "—" no lugar do preço.
- Animação: usar a do Radix (já existe), sem custom.

## 5. Tokens / estilos novos

Nada precisa entrar em `index.css` ou `tailwind.config`. Tudo é arranjo de utilitários existentes + valores arbitrários.

## Arquivos modificados

- `src/components/palm/MenuView.tsx` — tabs, busca, grid (gap/padding/cols), card simples, card de grupo, badge, botão (-).
- `src/components/palm/GroupVariantDialog.tsx` — header simplificado, lista refinada, divisores e tipografia.

## Não tocado

- Lógica: `handleAdd`, `onDecrement`, `isEsgotado`, grupos, ordenação, busca, esgotado-confirm, rename, move, FAB, query do Supabase.
- Outras telas (Kitchen, PDV, Admin, Cashier, Stock, Home).
- Bridge, impressão, Telegram, runtime global, banco.
- `index.css` e tokens de cor (paleta brasa preservada).

## Validação

1. Mobile 441×754: grid 2 colunas alinhado, cards com respiro, tap em qualquer área adiciona.
2. Categoria com grupo (ex.: Refeições): card de grupo abre popup; popup mostra variantes em lista clean.
3. Adicionar item: badge preto/branco aparece top-right, botão (−) aparece top-left.
4. Remover até 0: ambos somem.
5. Esgotado: card esmaecido, tap dispara confirm.
6. Busca: sem borda visível em repouso, foca discretamente.
7. Tabs: indicador 20px embaixo, sem fundo, contadores neutros.
8. `vitest` continua verde (nada de lógica muda).

## Resultado esperado

Cardápio com ar editorial/boutique: muito mais respiro, hierarquia óbvia (nome domina, preço sussurra), zero brasa decorativa, badges em P&B, popup de grupos refinado como uma seleção de menu de hotel. Toda lógica preservada.

