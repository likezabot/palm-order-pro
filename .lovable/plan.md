

## Revisão de responsividade — viewport real, safe-area e telas pequenas

Polimento estrutural de layout para funcionar de 320px a tablets, em retrato e paisagem, com notch, barra dinâmica do navegador e teclado virtual. Sem mudar visual, comportamento, banco ou lógica.

### Causa raiz dos problemas atuais

1. **Conflito body × páginas full-height**: `body` em `index.css` aplica `padding-top/bottom: env(safe-area-inset-*)`. Páginas usam `min-h-screen` (100vh) e componentes como `MenuView`/`OrderReview` usam `h-[100dvh]`. Como o `dvh`/`vh` é medido **antes** do padding do body, o conteúdo total = `100dvh + safe-area` → estoura a viewport em iPhones com notch (scroll vertical indesejado, footer cortado, header sobreposto).
2. **`min-h-screen` em vez de `min-h-dvh`**: 8 páginas usam `min-h-screen` (100vh fixo). No mobile, a barra do navegador some/aparece e cria saltos visuais; com teclado virtual aberto, layouts esticam para fora da tela visível.
3. **CartFab `fixed bottom-5 right-5`**: ignora `env(safe-area-inset-bottom)` — em iPhones com home indicator fica colado no indicador.
4. **Kitchen `md:h-screen`**: no desktop trava em 100vh; com barra do navegador dinâmica no iPad em paisagem, perde linha.
5. **TableGrid `grid-cols-3` fixo**: em telas de 320px (iPhone SE 1ª gen, Galaxy Fold dobrado) os 3 cards ficam < 90px e o conteúdo do botão (senha + nome garçom + valor + horário) quebra/transborda. Sem fallback para `grid-cols-2`.
6. **PrintStatusBadge `min-w-[220px] max-w-[280px]`**: em 320px com padding do pai, pode estourar a largura disponível.
7. **`maximum-scale=1.0, user-scalable=no`** no viewport meta: aceitável para PWA, mas combinado com inputs `font-size: 16px` (já presente) ok — sem mudança aqui.
8. **Headers com muitos botões em paisagem estreita** (`Pdv.tsx`, `Kitchen.tsx`, `Admin.tsx`): já usam `flex-wrap` mas alguns `truncate` faltam em chips de garçom/título.

### Estratégia

Padronizar **uma única regra de altura responsiva** baseada em `dvh` que respeita safe-area, e remover `padding` do body — movendo safe-area para containers de página individuais que precisam (headers/footers fixos), evitando o duplo desconto.

### Mudanças

#### 1. `src/index.css` — base
- **Remover** `padding-top/bottom` do `body` (mantém `padding-left/right` para landscape com notch lateral).
- Adicionar utilidade global `.h-screen-safe` e `.min-h-screen-safe`:
  ```css
  .h-screen-safe { height: 100dvh; height: calc(100dvh); }
  .min-h-screen-safe { min-height: 100svh; min-height: 100dvh; }
  ```
  Fallback `100svh` para iOS antigos sem `dvh`.
- Adicionar `.pt-safe`, `.pb-safe`, `.px-safe` utilities usando `env(safe-area-inset-*)` com fallback `0px`.
- `html, body { height: 100%; overscroll-behavior-y: none; }` para evitar bounce/pull-to-refresh quebrando layouts fixos.

#### 2. `tailwind.config.ts` — tokens
- Adicionar spacing `safe-top`, `safe-bottom` mapeando para `env(safe-area-inset-*)`.
- Adicionar `minHeight: { 'screen-dvh': '100dvh', 'screen-svh': '100svh' }` e `height: { 'screen-dvh': '100dvh' }`.

#### 3. Substituir `min-h-screen` → `min-h-dvh` (com fallback)
Páginas afetadas: `Index.tsx`, `Pdv.tsx`, `Cashier.tsx`, `Admin.tsx`, `NotFound.tsx`, `ForceUpdate.tsx`, `InstallPage.tsx`, `PrintStation.tsx`, `ProductForm.tsx`, `CloseOrder.tsx`, `TableGrid.tsx` (2 ocorrências).
- Trocar por `min-h-dvh` (Tailwind 3.4+ suporta nativamente; senão usar classe `min-h-screen-safe`).

#### 4. Componentes de tela cheia (`MenuView`, `OrderReview`)
- Trocar `h-[100dvh]` por `h-dvh` (Tailwind nativo) — mantém comportamento mas sem string mágica.
- Como removemos `padding-top` do body, o `pt-[calc(0.625rem+env(safe-area-inset-top))]` no header continua válido e correto (agora é o **único** desconto, sem somar duas vezes).

#### 5. `Kitchen.tsx`
- Trocar `md:h-screen` por `md:h-dvh`.
- Garantir que o grid das colunas use `min-h-0` em todos os pais para permitir scroll interno correto em paisagem.

#### 6. `CartFab.tsx`
- `bottom-5` → `bottom-[calc(1.25rem+env(safe-area-inset-bottom))]`.
- `right-5` → `right-[calc(1.25rem+env(safe-area-inset-right))]`.

#### 7. `OrderReviewFooter.tsx`
- Já usa `pb-[calc(1rem+env(safe-area-inset-bottom))]` ✓ (mantém).

#### 8. `TableGrid.tsx` — grid de mesas
- `grid-cols-3 md:grid-cols-4 lg:grid-cols-5` → `grid-cols-2 [@media(min-width:380px)]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5`.
- Reduzir `gap-3` para `gap-2 sm:gap-3` em telas estreitas.
- Cards de BALCÃO: `min-w-[120px]` → `min-w-[112px]` para caber 2.5 cards em 320px.

#### 9. `PrintStatusBadge.tsx`
- `min-w-[220px] max-w-[280px]` → `w-full max-w-[280px]` + container pai com `px-4` — adapta naturalmente.

#### 10. Headers densos (Pdv, Admin, Kitchen)
- Auditoria rápida: garantir `min-w-0` + `truncate` em títulos/chips que podem estourar; adicionar `flex-wrap` onde falta.

#### 11. Teclado virtual (inputs em modais/forms)
- Em `OrderReview` (input nome cliente) e `MenuView` (busca): garantir que o container scroll pai tenha `overflow-y-auto` e o input rolagem natural — já ok pela estrutura `flex-col h-dvh`. Sem JS.
- Adicionar `scroll-padding-bottom: env(safe-area-inset-bottom)` no `html` para que `scrollIntoView` de inputs respeite teclado.

#### 12. Orientação paisagem
- `MenuView`/`OrderReview`: já são flex-col com header/footer fixos e content scroll — funciona em paisagem com a correção de altura.
- `Kitchen` paisagem mobile: hoje vira scroll vertical de 3 colunas empilhadas (`grid-cols-1` < md). Manter, mas trocar breakpoint `md` para `sm` no grid (`grid-cols-1 sm:grid-cols-3`) para aproveitar paisagem em celular.

### Arquivos afetados (15)

**Base (2):** `src/index.css`, `tailwind.config.ts`.

**Páginas (10):** `src/pages/Index.tsx`, `Pdv.tsx`, `Cashier.tsx`, `Admin.tsx`, `Kitchen.tsx`, `NotFound.tsx`, `ForceUpdate.tsx`, `PrintStation.tsx`, `src/components/install/InstallPage.tsx`, `src/components/admin/ProductForm.tsx`, `src/components/cashier/CloseOrder.tsx`.

**Componentes (4):** `src/components/palm/TableGrid.tsx`, `MenuView.tsx`, `OrderReview.tsx`, `CartFab.tsx`, `PrintStatusBadge.tsx`.

### Sem alterações
- Nenhuma mudança em banco, RPCs, hooks, lógica de negócio, fluxo de envio/impressão, componentes shadcn (`button.tsx`, `dialog.tsx` etc.).
- Visual idêntico em telas onde já funcionava — só corrige overflow, cortes e safe-area.
- Sem dependências novas. CSS-first; nada de JS para detectar viewport (exceto o que já existe).

### Resultado esperado
- iPhone SE (375×667), iPhone 14 (390×844), iPhone 14 Pro Max (430×932), Galaxy S8 (360×740), Galaxy Fold dobrado (280×653), Pixel 7 (412×915) e tablets (iPad 768×1024, iPad Pro 1024×1366) — todos sem cortes, sem scroll horizontal, sem elementos atrás de notch/home indicator.
- Paisagem em celular: header/footer não cobrem conteúdo; Kitchen aproveita 3 colunas a partir de 640px.
- Barra dinâmica do Safari/Chrome mobile: layout não "pula" ao rolar (graças a `dvh`).
- Teclado virtual: input focado fica visível; footer não invade a área do teclado.

