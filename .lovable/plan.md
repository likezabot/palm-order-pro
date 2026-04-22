

# Alinhar `GroupVariantDialog` ao novo design do cardápio

O dialog que abre ao tocar em "Ver opções" ainda usa o design antigo (badge vermelho "ESGOTADO", "+ ADD" agressivo, ícone de emoji no título, botão inteiro como ação). Refatorar para o mesmo padrão limpo do `MenuView`.

## Mudanças em `src/components/palm/GroupVariantDialog.tsx`

### 1. Título sem emoji
- Remover `{groupIcon}` do `DialogTitle`. Ficar apenas **"Escolha — {groupName}"**.
- Remover a prop `groupIcon` (e atualizar o uso em `MenuView.tsx` para não passar mais).

### 2. Item esgotado — visual neutro
- Trocar `bg-card/60 border-destructive/40` por `bg-muted/30 border-border opacity-60`.
- Remover badge vermelho "Esgotado". Substituir por texto pequeno `text-muted-foreground italic` → **"Indisponível"** ao lado do nome.

### 3. Reordenação automática
- `available` primeiro, `esgotado` no fim (sort estável). Variantes não cadastradas (`product == null`) vão para o fim também.

### 4. Botão "Adicionar" forte (igual MenuView)
- Cada variante vira um `div` (não mais `<button>` externo).
- Rodapé com botão full-width:
  - Disponível: `bg-primary text-primary-foreground font-bold rounded-lg py-2 active:scale-95` → **"Adicionar"**.
  - Esgotado: `bg-muted text-muted-foreground cursor-not-allowed` → **"Indisponível"**. Mantém `onClick` para preservar o gate do `EsgotadoConfirmDialog` (igual MenuView).
- Variante não cadastrada permanece como hoje (sem botão, texto "Não cadastrado no admin").

### 5. Hierarquia visual
- Nome: `font-bold text-base text-foreground`.
- Preço: `text-base font-extrabold text-primary` (cor sólida, sem gradiente).
- Espaçamento `gap-1.5`, padding `p-2.5`.
- Badge de quantidade (`animate-badge-pop`) mantido no canto.

### 6. Atualização em `MenuView.tsx`
- Remover a prop `groupIcon={group.icon}` na chamada do `GroupVariantDialog` (ou deixar opcional/ignorada).

## Não alterado
- Lógica `onPick`, `isEsgotado`, `getQty`, fluxo de `EsgotadoConfirmDialog`, backend, hooks de estoque/receitas.

## Arquivos modificados
- `src/components/palm/GroupVariantDialog.tsx` — refatoração completa do visual.
- `src/components/palm/MenuView.tsx` — remover passagem de `groupIcon`.

