
O usuário quer que o Admin > Cardápio fique visualmente igual ao cardápio do garçom (Palm/MenuView) — mesma navegação por abas de categoria, mesmo layout de cards — mas com um botão de "visível/invisível" (toggle ativo) em cada card, ao invés da lista vertical atual com edit/delete grande.

## O que mudar

**Tela Admin > Cardápio** (hoje: lista vertical com todas categorias empilhadas, cards grandes com switch + editar + apagar + arrastar):

Passa a ter:
1. **Tabs de categoria no topo** (Refeições, Espetos, Bebidas, Cervejas) — idêntico ao Palm.
2. **Grid de cards** da categoria ativa, no mesmo estilo visual do Palm (card branco, nome em destaque, preço).
3. **Em cada card**: um botão discreto de olho 👁 / 👁‍🗨 (visível/oculto) no canto. Tocar alterna `active` direto, sem precisar abrir edição.
4. **Ações secundárias** (editar, apagar, arrastar pra reordenar) ficam acessíveis via toque longo OU um menu "•••" no canto do card — pra não poluir.
5. **Card especial "Porco"** continua aparecendo como popup (igual hoje), mas no mesmo grid visual.
6. **Botão flutuante "+ Novo produto"** no rodapé, contextual à categoria ativa.

## Como fica

```text
┌─────────────────────────────────┐
│ [Refeições][Espetos][Beb][Cerv] │  ← tabs (Palm)
├─────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐      │
│ │Porco │ │Bovino│ │Frango│ ...  │  ← grid de cards
│ │R$15  │ │R$12  │ │R$10  │      │
│ │  👁 ⋯│ │  👁 ⋯│ │  🚫⋯ │     │  ← olho = ativo, ⋯ = menu
│ └──────┘ └──────┘ └──────┘      │
│                                 │
│      [+ Novo produto]           │  ← contextual
└─────────────────────────────────┘
```

Cards inativos ficam com opacidade reduzida + ícone de olho riscado, mantendo o feedback visual atual.

## Arquivos afetados

- `src/pages/Admin.tsx` — substituir a lista empilhada por tabs + grid; ações de "Restaurar A-Z" e "Card especial Porco" continuam, só mudam de lugar (botão pequeno no header da categoria ativa).
- `src/components/admin/SortableProductCard.tsx` — redesenhar como card de grid (estilo Palm) com botão olho proeminente e menu "⋯" pras outras ações; manter `useSortable` pra drag.
- Reuso da lógica de drag, reorder, reset A-Z, Porco popup, ProductForm — sem mudanças no banco nem em outras telas.

## Pontos a confirmar

- Manter drag pra reordenar dentro da categoria ativa? (Sim, presumo — é funcionalidade pedida antes.)
- Editar/apagar via menu "⋯" (3 pontos) em cada card está ok? Ou prefere edit ao tocar no card e olho separado?
