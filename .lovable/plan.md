

## Corrigir header coberto pela status bar do iPhone (notch/Dynamic Island)

### Problema
No iPhone, o topo da tela do MenuView (e demais páginas) é renderizado **atrás** da barra de status do iOS. Isso esconde:
- O botão "Voltar" (sobreposto pelo relógio "20:47")
- O nome da mesa e os botões de **renomear** e **mover mesa** (sobrepostos pelos ícones de bateria/sinal)

Causa raiz: o `index.html` usa `viewport-fit=cover` + `apple-mobile-web-app-status-bar-style: black-translucent`, que pedem ao iOS para renderizar sob a status bar. Em `src/index.css`, o `body` aplica safe-area só nas laterais (`padding-left/right`), faltando o **topo**.

### Solução

**1. Adicionar safe-area no topo globalmente (`src/index.css`)**
- Acrescentar `padding-top: env(safe-area-inset-top)` no `body` (já tem `padding-left/right`).
- Acrescentar `padding-bottom: env(safe-area-inset-bottom)` para evitar que a barra inferior do iPhone cubra conteúdo em outras telas.

**2. Ajustar containers full-height que usam `h-[100dvh]`**
Componentes como `MenuView` usam `h-[100dvh]` e ocupam 100% da viewport, **ignorando o padding do body**. Para esses, o safe-area precisa ser aplicado dentro do próprio container.

Aplicar em:
- `src/components/palm/MenuView.tsx` — header recebe `pt-[env(safe-area-inset-top)]` (somado ao `p-2.5` existente via classe utilitária).
- `src/components/palm/OrderReview.tsx` — mesma correção no header se também usa `100dvh`.

Padrão a aplicar no header:
```tsx
<div className="shrink-0 bg-background border-b border-border p-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))]">
```

**3. Verificar outras páginas full-screen com risco**
Inspecionar e aplicar mesmo tratamento se necessário em:
- `src/pages/Kitchen.tsx`
- `src/pages/Cashier.tsx`
- `src/pages/Pdv.tsx`
- `src/pages/Admin.tsx`
- `src/pages/Index.tsx` (home)

Se já usam o body padding (não forçam altura 100dvh com layout próprio), o passo 1 já resolve. Caso forcem altura/topo zero, aplicar `pt-[env(safe-area-inset-top)]` no primeiro elemento.

### Resultado esperado
- iPhone com notch/Dynamic Island: header desce ~47px abaixo da status bar; "Voltar", nome da mesa e ícones (✏️ renomear / ⇄ mover) ficam totalmente visíveis e clicáveis.
- Android e desktop: `env(safe-area-inset-top)` resolve para `0px` — nenhum impacto visual.
- Sem mudança de banco, sem mudança de comportamento, só CSS.

### Arquivos afetados
- `src/index.css` — body ganha `padding-top` e `padding-bottom` com safe-area.
- `src/components/palm/MenuView.tsx` — header com padding-top safe-area.
- `src/components/palm/OrderReview.tsx` — mesmo ajuste se aplicável.
- Demais páginas: revisão rápida durante implementação; ajuste só onde o layout força topo zero.

