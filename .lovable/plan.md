

# Cardápio premium — visual clean estilo app de luxo

## Objetivo

Transformar o cardápio do PALM (`MenuView.tsx`) e o popup de variantes (`GroupVariantDialog.tsx`) em uma interface minimalista, elegante, sem ruído visual.

## O que muda

### 1. Cards do cardápio (grade principal)

**Removido:**
- Botão laranja "Adicionar" (pollui visualmente).
- Botão laranja "Ver opções" nos grupos.
- Subtítulo redundante "Ver opções · 2 opções".

**Mantido / refeito:**
- O **card inteiro vira o gesto de adicionar** (tap em qualquer área = adiciona). Para grupos, tap = abre popup.
- Layout vertical clean: nome do produto (forte), preço (discreto, abaixo).
- Badge de quantidade `1`, `2`, `3…` continua no canto superior direito, agora mais refinado (sem gradiente forte, círculo sólido pequeno com ring sutil).
- Botão `(−)` no canto superior esquerdo, **só aparece quando qty > 0**, em estilo fantasma/glass — discreto, não vermelho gritante.
- Indicador de grupo: pequeno chevron `›` ou pill `+N` no canto, sinalizando que abre opções (sem texto verboso).

**Estética:**
- Cards com `bg-card`, borda quase invisível, `rounded-2xl`, shadow muito suave.
- Tap state com leve scale `0.98` + glow sutil.
- Tipografia: nome em `font-semibold` (não `extrabold`), preço em `text-sm tabular-nums text-muted-foreground` — preço deixa de gritar.
- Espaçamento mais generoso (`p-3.5`, `gap-2`).
- Estado "indisponível": opacidade reduzida + tap desabilitado, sem badge "Indisponível" extra (só dimming + label inline pequeno).

### 2. Popup de grupos (`GroupVariantDialog`)

- Confirmar que **continua sendo popup/Dialog** (já é, conforme pedido).
- Aplicar o mesmo redesign clean: remover botão "Adicionar"/"Indisponível" — tap no card da variante adiciona direto e fecha.
- Nome + preço discreto + badge de qty no canto. Botão `(−)` só quando há quantidade.
- Header do dialog mais leve: título fino, sem peso excessivo.
- Cards das variantes em lista vertical compacta com divisores sutis (estilo iOS).

### 3. Header da tela

- Reduzir peso visual: "Voltar" mais discreto, "Mesa: 9" alinhado à direita com tipografia clean.
- Campo de busca: borda mais leve, fundo levemente diferenciado, ícone em cinza neutro.
- Tabs de categoria: remover o fundo `bg-primary/5` no ativo, manter só o sublinhado em gradiente brasa (mais fino, 2px) + texto mais escuro. Badge de contagem por categoria mais discreto (mesmo estilo do badge dos cards).

### 4. Refino de tokens (sem mudar marca)

- Continuar com a paleta atual (laranja brasa `#E25822` como acento).
- Reduzir uso do `bg-brand-gradient` nos micro-elementos (badges) — reservar gradiente para o FAB do carrinho que já é o ponto focal.
- Sombras: trocar `shadow-soft` ruidoso por shadow quase imperceptível nos cards (`shadow-[0_1px_2px_rgba(0,0,0,0.04)]`).

## Arquivos modificados

- `src/components/palm/MenuView.tsx`
  - Reescrever a renderização do card de produto e do card de grupo (linhas ~349-444).
  - Tornar todo o card clicável (substituir `<button Adicionar>` por handler no container).
  - Refinar header, busca, tabs (linhas ~203-309).
- `src/components/palm/GroupVariantDialog.tsx`
  - Mesma linguagem: tap no card = adicionar, sem botão.
  - Lista vertical clean.

## Não alterado

- Lógica de carrinho, estoque, esgotado, grupos, ordenação persistida — tudo intacto.
- `CartFab`, `EsgotadoConfirmDialog`, `MoveTableDialog`, `RenameTableDialog`.
- Bridge `.exe`, impressão, Telegram, banco.
- Outras telas (Kitchen, PDV, Admin, Cashier, Stock).

## Detalhes técnicos

**Acessibilidade do tap-no-card-todo:**
- Card vira `<button>` semântico (`type="button"`), não `<div onClick>`, para manter foco/teclado/aria.
- `aria-label="Adicionar {nome} — R$ X,XX"`.
- O botão `(−)` interno usa `e.stopPropagation()` (já faz hoje) para não disparar o add.

**Estados visuais:**
- Default: card branco/escuro neutro, borda 1px `border-border/60`.
- Hover (desktop): `border-primary/30` muito leve.
- Active/tap: `scale-[0.98]` + brilho rápido.
- Com qty > 0: borda `border-primary/40` + leve `bg-primary/[0.03]` para indicar que está no carrinho, sem gritar.
- Esgotado: `opacity-50`, cursor-not-allowed, sem hover.

**Tokens novos no Tailwind (se necessário):**
- Nada novo obrigatório — usar utilidades já existentes (`bg-card`, `text-muted-foreground`, `border-border`, `rounded-2xl`, `tabular-nums`).

## Como vou validar

1. Abrir o PALM no preview, navegar pelas 4 categorias (Refeições, Espetos, Bebidas, Cervejas).
2. Tocar em produto simples → adiciona, badge `1` aparece, botão `(−)` surge no canto superior esquerdo.
3. Tocar de novo → vai para `2`, `3`. Tocar no `(−)` → decrementa.
4. Tocar em produto-gatilho de grupo → abre popup. Tocar em variante → adiciona e fecha.
5. Conferir visual em mobile (441×754, viewport atual) — sem quebra de grid, sem overflow.
6. Conferir busca, troca de categoria, indisponível.
7. Rodar `vitest` (testes existentes não devem ser afetados — só visual).

## Resultado esperado

Cardápio com cara de app premium: muito espaço em branco, tipografia limpa, interação por tap-no-card-inteiro, badges minimalistas, zero botões "Adicionar"/"Ver opções" poluindo. Popups iguais em estilo. Nada na lógica de negócio, impressão ou bridge é tocado.

