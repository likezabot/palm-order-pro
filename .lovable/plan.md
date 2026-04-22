

## Refinar barra de categorias: badge no canto + animação ao mudar

### Problema atual
- Badge inline (ao lado do texto) cria larguras variáveis por categoria → tabs "dançam" quando o número aparece/some.
- Sem animação: mudança no contador passa despercebida em fluxo intenso.
- Categoria ativa só tem underline fino; pouco destaque no mobile.

### Mudanças em `src/components/palm/MenuView.tsx`

**1. Badge no canto superior direito (absolute)**
- Tab vira container `relative` com `padding` consistente: `px-4 py-2.5 pr-5` (deixa respiro à direita pro badge).
- Badge `absolute top-1 right-1`, formato bolinha compacta:
  - `min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none`
  - Sólido sempre que `count > 0`: `bg-primary text-primary-foreground`
  - Borda fina `ring-2 ring-background` para "destacar" do fundo da tab/underline
  - Categoria ativa: badge ganha `shadow-glow` e `scale-110` sutil (destaque maior)
  - `count === 0` → não renderiza (some completamente)

**2. Animação ao mudar contador**
- Hook local `usePrevious(count)` por categoria (ou `useRef<Record<string, number>>`).
- Quando `count !== prev && count > 0`, aplicar classe `animate-badge-pop` por ~350ms via `key={count}` no `<span>` do badge (remonta → animação roda).
- Adicionar keyframe em `tailwind.config.ts`:
  ```ts
  "badge-pop": {
    "0%":   { transform: "scale(1)" },
    "40%":  { transform: "scale(1.35)" },
    "100%": { transform: "scale(1)" },
  }
  ```
  e `animation: { "badge-pop": "badge-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)" }`.
- Bônus: aplicar mesma animação no badge `+ qty` dos cards de produto quando a quantidade muda — mesma técnica `key={qty}`.

**3. Layout/espaçamento da barra**
- Container: manter `flex gap-1 overflow-x-auto no-scrollbar border-b border-border`, mas trocar gap → `gap-0` para tabs encostadas (visual de tab bar real).
- Cada tab tem padding generoso: `px-4 py-3` (mais alto, melhor toque mobile).
- Texto sempre centralizado com `min-w-[88px]` → tabs com larguras estáveis (não mais "dança" quando badge aparece).
- Categoria ativa:
  - `text-foreground` + `font-bold` (era `font-semibold`)
  - underline gradiente mais grosso: `h-[3px]` (era `h-0.5`), cantos arredondados, ancorado em `bottom-0`
  - leve `bg-foreground/[0.03]` no fundo da tab ativa (sutil, melhora leitura)
- Inativa: `text-muted-foreground font-semibold`, hover/active: `text-foreground`.

**4. Responsividade**
- Tudo continua em `flex` com `overflow-x-auto no-scrollbar` → mobile mantém scroll horizontal.
- Larguras fixas mínimas garantem que mobile e desktop tenham mesmo ritmo visual.
- `pr-5` + badge `right-1` funciona igual nos dois.

### Arquivos
- **Editado** `src/components/palm/MenuView.tsx` — badge absolute no canto, animação via `key={count}`, layout refinado da barra.
- **Editado** `tailwind.config.ts` — keyframe + animação `badge-pop`.

### Resultado
- Badges sempre no mesmo lugar (canto superior direito), tamanho compacto (~18px), sólidos quando >0, invisíveis quando 0.
- Tabs com largura estável → barra não "treme" ao adicionar item.
- Categoria ativa muito mais clara: negrito + underline grosso gradiente + leve fundo.
- Cada item somado dispara um pop sutil (~350ms) no badge da categoria — feedback imediato sem distrair.
- Mesma experiência em mobile (441px) e desktop.

