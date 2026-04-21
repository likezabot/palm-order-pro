

## Aprimoramento visual do app inteiro

Polimento visual coeso em toda a aplicação, sem mexer em lógica, banco, RPCs ou comportamento. Mantém a identidade dark + laranja brasa atual e melhora hierarquia, profundidade, microinterações e densidade de informação.

### 1. Sistema de design (base de tudo)

**`src/index.css`** — refinar tokens e adicionar utilidades:
- Tons de superfície escalonados: `--card` levemente mais claro (10.2% → 8%) e novo `--surface-elevated` (12%) para cards "destaque" (BALCÃO, painel de instalação).
- Adicionar variável de gradiente da marca: `--brand-gradient: linear-gradient(135deg, hsl(14 85% 55%) 0%, hsl(20 90% 50%) 100%)` (laranja brasa → âmbar quente).
- Sombras coesas: `--shadow-soft`, `--shadow-card`, `--shadow-glow-primary` (glow laranja sutil para itens ativos).
- Novas keyframes globais: `fade-in-up`, `scale-in`, `shimmer` (skeletons) — substituindo o uso disperso de `animate-pulse`.
- Classe utilitária `.glass-card` (bg semi-transparente + blur) para o header do MenuView quando rola.
- Classe `.brand-gradient-text` e `.brand-gradient-bg` para títulos/CTA principais.
- Scrollbars customizadas finas (4px, cor `--border`) — hoje a `.scrollbar-hide` esconde tudo; manter onde já usa, mas estilizar onde aparece.

**`tailwind.config.ts`** — adicionar:
- `boxShadow: { soft, card, glow: '0 0 24px hsl(var(--primary)/0.35)' }`.
- `backgroundImage: { 'brand-gradient': 'var(--brand-gradient)' }`.
- Animations: `fade-in-up`, `scale-in`, `shimmer` (já tem `print-feed`/`fade-in`, complementar).

### 2. Tela inicial (`src/pages/Index.tsx`)

- Logo "PLANO B" com `brand-gradient-text` + leve `tracking-widest` e subtítulo "ESPETARIA" em uppercase espaçado.
- Cards de modo: substituir borda simples por `bg-card shadow-card hover:shadow-glow hover:border-primary/40 hover:-translate-y-0.5` + ícone `lucide-react` colorido (Smartphone, Monitor, ChefHat, Settings) substituindo emojis (mantendo emoji apenas como acento decorativo opcional).
- Cards de instalação: virar mini-cards com gradiente sutil no topo + ícone destacado em círculo.
- Animação de entrada escalonada (`animate-fade-in-up` com `animation-delay` por item).

### 3. TableGrid — hub de mesas (`src/components/palm/TableGrid.tsx`)

- Cabeçalho do garçom: chip atual fica em "pill" com `shadow-soft` + cor de status (online dot verde animado).
- Seção BALCÃO: cards horizontais ganham `shadow-card`, número da senha em `text-2xl brand-gradient-text`, espaçamento maior, divisor sutil entre senha e infos.
- Botão "NOVO PEDIDO": gradiente brasa + ícone com `animate-pulse` discreto.
- Mesas: bordas mais grossas onde ocupado, mas com `border-2` quando livre (mais leve). Conteúdo do botão ganha hierarquia (senha grande, infos secundárias `opacity-70`). Status badges em chips `rounded-full px-2`.
- Skeleton de carregamento real (shimmer) em vez de spinner único.

### 4. MenuView — cardápio (`src/components/palm/MenuView.tsx`)

- Header sticky com efeito glass quando rola (`backdrop-blur` + `bg-background/80`).
- Tabs de categoria: pílulas com `shadow-soft` quando ativa + transição suave de `width` (laranja gradient na ativa).
- Cards de produto: cantos `rounded-2xl`, padding maior, preço em destaque com `text-primary font-black`, badge de quantidade em círculo com `shadow-glow` quando >0, hover sutil `shadow-card`.
- Card "Porco" e cards de subgrupo: badge "Escolher tipo" vira chip com seta (`ChevronRight`).
- Search input: `rounded-2xl` + `shadow-soft` + ícone à esquerda em `text-primary` quando focado.
- Estado vazio: ilustração textual centralizada com ícone grande `opacity-30`.

### 5. Cart / OrderReview / OrderSuccess

- **CartFab**: já flutuante; adicionar `shadow-glow` + `animate-scale-in` na entrada + contador animando (count-up sutil).
- **OrderReview**: linhas do carrinho (`CartItemRow`) ganham hover/active state, divisores mais sutis, footer com sombra superior (`shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.5)]`) para destacar do conteúdo.
- **OrderSuccess**: gradiente verde mais rico (sucesso → emerald escuro), ícone check com `animate-scale-in` + `animate-pulse` ring, tipografia maior na senha (`text-7xl`), badge de impressão integrado visualmente (não flutuante).

### 6. Kitchen (`src/pages/Kitchen.tsx` + `KanbanColumn`/`KanbanCard`)

- Colunas com header colorido por status (`bg-blue-500/10` Novo, `bg-red-500/10` Preparo, `bg-amber-500/10` Pronto) + contador grande no header.
- Cards: borda lateral colorida (4px) indicando status, tempo decorrido com ícone `Clock` em chip, animação `fade-in-up` quando entram.
- Background da página: gradiente vertical sutil `from-background to-background/50`.

### 7. Cashier / Pdv / Admin

- Headers padronizados com mesma estrutura: título + subtítulo + ações à direita, separator com `bg-gradient-to-r from-border to-transparent`.
- Cards de pedido (Cashier): borda lateral colorida por status, valor total em `brand-gradient-text` para destaque.
- Tabs do Admin: pílulas modernas (estilo dos shadcn refinado), conteúdo com `animate-fade-in` ao trocar.
- StatsPanel: cards com ícone em círculo colorido + número grande + delta percentual abaixo (se aplicável).

### 8. Microinterações globais

- Todos os botões interativos: `active:scale-95 transition-all duration-150` consistente (já parcial — uniformizar).
- Toasts (`sonner`): cores semânticas mais ricas (success com `bg-success/15 border-success/40`, error idem).
- Skeleton de loading reusável (`<Skeleton />` shadcn já existe — usar onde hoje só tem spinner).
- Transições de rota: wrapper em `App.tsx` com `animate-fade-in` por página (sem libs novas).

### 9. Acessibilidade & polimento final

- Aumentar contraste de `text-muted-foreground` (62.7% → 68%) — alguns labels ficam apagados demais.
- `focus-visible` ring laranja consistente em todos os elementos interativos (já existe no `Button`, estender para botões nativos críticos).
- `prefers-reduced-motion`: desabilitar animações decorativas (`pulse-active`, `print-bounce`) automaticamente.

### Arquivos afetados

**Tokens/base (4):**
- `src/index.css` — tokens de superfície, gradiente, sombras, keyframes, glass utility, scrollbar.
- `tailwind.config.ts` — shadows, backgroundImage, novas animations.
- `src/App.tsx` — wrapper de transição de página.
- `src/components/ui/sonner.tsx` — variantes semânticas.

**Telas principais (8):**
- `src/pages/Index.tsx` — home redesign leve.
- `src/components/palm/TableGrid.tsx` — hub modernizado.
- `src/components/palm/MenuView.tsx` — header glass + cards refinados.
- `src/components/palm/CartFab.tsx`, `CartItemRow.tsx`, `OrderReview.tsx`, `OrderSuccess.tsx` — carrinho coeso.
- `src/pages/Kitchen.tsx` + `src/components/kitchen/KanbanColumn.tsx` + `KanbanCard.tsx` — colunas coloridas.

**Telas secundárias (4) — polimento mais leve:**
- `src/pages/Cashier.tsx`, `src/pages/Pdv.tsx`, `src/pages/Admin.tsx`, `src/components/admin/StatsPanel.tsx`.

### Sem alterações
- Banco, RPCs, edge functions, lógica de impressão, fluxo anti-multiclique, hooks de dados, `src/components/ui/button.tsx`, `src/integrations/supabase/*`.
- Nenhum componente shadcn é reescrito — só consumidos com novas classes.
- Nenhuma dependência nova.

### Resultado esperado
Visual mais profissional, com hierarquia clara, profundidade (sombras + gradientes sutis), microinterações suaves e identidade de marca reforçada — preservando 100% do comportamento atual.

