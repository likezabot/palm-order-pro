
# 🎨 Plano — Refino visual premium do cardápio público

## ⚠️ Garantias de segurança (escopo exclusivamente visual)

- ✅ Mudanças **somente CSS / classes Tailwind / tokens HSL**.
- ✅ Tudo escopado dentro de `.public-menu-theme` (não afeta admin, palm, kitchen, cashier, impressão, bridge, EXE, edge functions, RLS, payloads, print_jobs, Supabase).
- ✅ Nenhum `onClick`, `onSubmit`, query, mutation, rota ou contrato é tocado.
- ✅ Nenhum arquivo de `src/lib/*.ts` (lógica), `supabase/*`, `bridge/*`, hooks de pedido, print queue ou edge function é alterado.
- ✅ Nenhum teste existente é removido (paridade com `menu-hero-wcag.test.ts` mantida).

## 🎯 Direção visual

Linha **gastronômica/premium**: laranja queimado → cobre/dourado, neutros creme/off-white, marrom escuro café para texto, verde "lima" só no badge "aberto agora". Profundidade vem de **degradês suaves + sombras coloridas leves** (não preto puro) + **superfícies elevadas** com tinte quente sutil.

---

## 📋 Escopo de arquivos

| Arquivo | O que muda | O que NÃO muda |
|---|---|---|
| `src/index.css` (bloco `.public-menu-theme`) | Tokens HSL refinados (terracota + dourado + creme), novos tokens auxiliares (`--brand-gradient-soft`, `--surface-warm`, `--shadow-warm`), gradiente sutil no `body` do tema, melhoria de scrollbar do tema | Tokens globais (light/dark base), tokens do admin/palm/kitchen, alto contraste (`html.hc`), keyframes |
| `src/components/public-menu/PublicMenuLayout.tsx` | Fundo com gradiente quente sutil (radial creme → off-white), footer mais discreto e elegante | Estrutura, props, children |
| `src/components/public-menu/MenuHero.tsx` | Faixa entre hero e conteúdo mais orgânica (fade já existe — refinar curva/cores), logo com anel `ring` em tom cobre + sombra dupla quente, chips de tempo/entrega com leve degradê creme, refino do título (tracking/peso) | Lógica de overlay adaptativo WCAG, cache, sampling, contratos de prop |
| `src/components/public-menu/CategoryNav.tsx` | Chip ativo com `var(--brand-gradient)` + sombra quente; chip inativo com fundo creme suave e borda hairline; sticky com blur mais elegante e borda bottom em tom de marca a 10% | Lógica sticky, scroll, props |
| `src/components/public-menu/ProductCard.tsx` | Card com sombra quente (não preta), borda hairline em tom creme, hover com `translate-y` + glow de marca; preço com leve tracking; botão `+` (QuickAdd) com gradiente de marca + sombra glow | **Toda lógica de QuickAdd, a11y, aria-labels, focus-visible já existentes mantidos intactos** |
| `src/components/public-menu/PublicCartFab.tsx` | CTA com degradê laranja→cobre mais rico, sombra glow primária, hierarquia entre badge de qtd / texto / preço refinada, divisor sutil entre texto e preço | Lógica de pulse, contagem, props, posicionamento safe-area |
| `src/components/public-menu/OpenStatusBadge.tsx` | Badge "ABERTO AGORA" mais elegante: pílula com leve degradê verde-lima, dot pulsante refinado, tipografia `tracking-wide` | Comportamento de clique (abre dialog de horários) |
| `src/pages/PublicMenu.tsx` | **Apenas** estilização do `<input>` de busca (linhas ~349-358): wrapper com sombra suave, borda creme, focus ring em tom de marca, ícone com cor warmer | **Nada mais nesse arquivo** — toda lógica de query, useEffect de paleta dinâmica, cart, quickAdd, navegação preservada |

> **Não tocar:** `CartDrawer`, `ProductDetailSheet`, `UpsellDialog`, `HoursDialog`, `FeaturedCarousel`, `TopSellersSection`, `WhatsAppFab`, `ClosedOverlay` — para limitar superfície de risco. Esses já herdam os novos tokens do tema automaticamente.

---

## 🎨 Tokens novos / ajustados (em `.public-menu-theme`)

```css
.public-menu-theme {
  /* Paleta refinada — quente, gastronômica, sofisticada */
  --background: 36 38% 97%;            /* #FAF6F0 creme muito claro */
  --foreground: 18 28% 16%;            /* #34221B café profundo */
  --card: 36 50% 99%;                  /* off-white quente */
  --surface-elevated: 32 40% 94%;
  --surface-warm: 28 45% 96%;          /* NOVO — superfície com tinte cobre */
  
  --primary: 14 76% 46%;               /* terracota elegante */
  --primary-glow: 22 88% 56%;          /* cobre/brasa */
  --accent: 36 78% 52%;                /* dourado suave (era mostarda chapado) */
  --accent-foreground: 18 28% 14%;
  
  --muted: 32 28% 93%;
  --muted-foreground: 18 16% 36%;
  --border: 32 22% 88%;
  
  --success: 142 48% 38%;              /* verde mais harmonizado, menos saturado */
  
  --brand-gradient: linear-gradient(135deg, hsl(14 76% 46%) 0%, hsl(22 88% 52%) 55%, hsl(36 78% 52%) 100%);
  --brand-gradient-soft: linear-gradient(135deg, hsl(28 45% 96%) 0%, hsl(36 50% 99%) 100%); /* NOVO */
  --shadow-warm: 0 10px 30px -12px hsl(18 60% 25% / 0.18), 0 2px 6px hsl(18 40% 20% / 0.06); /* NOVO */
  --shadow-glow-primary: 0 0 32px hsl(14 76% 46% / 0.28);
}
```

E um fundo sutil no layout:
```css
.public-menu-theme {
  background:
    radial-gradient(1200px 600px at 50% -10%, hsl(36 60% 92% / 0.6), transparent 60%),
    hsl(var(--background));
}
```

---

## 🧩 Mudanças por componente (resumo visual)

1. **Hero** — fade orgânico mais longo, logo com `ring-2 ring-[hsl(var(--accent)/0.5)]` + duas sombras (uma cobre, uma profundidade), chips de tempo com `bg-surface-warm` e ícone em tom cobre.
2. **Chips de categoria** — ativo: `bg-[var(--brand-gradient)] text-white shadow-[var(--shadow-glow-primary)]`; inativo: `bg-surface-warm text-foreground/70 border border-border/60`.
3. **Busca** — `shadow-[var(--shadow-soft)] border-border/60 bg-card`, ícone com `text-foreground/45`.
4. **ProductCard** — `shadow-[var(--shadow-warm)] hover:shadow-[var(--shadow-glow-primary)/0.25] border-border/60`; preço com `tracking-tight`; botão `+` com `bg-[var(--brand-gradient)] shadow-[0_4px_14px_-2px_hsl(var(--primary)/0.5)]`.
5. **CTA carrinho** — degradê `135deg` com 3 stops, badge de qtd com `bg-white/30 backdrop-blur`, divisor vertical sutil entre "Ver carrinho" e preço, sombra glow.
6. **Badge aberto** — pílula com `bg-gradient-to-r from-success to-success/80`, dot com pulse mais sutil.

---

## ✅ Verificações pós-mudança

1. WCAG: o teste `menu-hero-wcag.test.ts` continua passando (a luminância base do overlay não é alterada — só refinamos cores periféricas).
2. Cardápio em mobile (441×754, viewport atual): verificar abertura, scroll, chips, cards, FAB do carrinho.
3. Confirmar que `/admin`, `/palm`, `/kitchen`, `/cashier`, `/pdv`, `/print-station` não foram afetados (nenhum CSS global foi tocado).
4. Confirmar que clicar em produto continua abrindo o `ProductDetailSheet` (nenhum handler tocado).
5. Confirmar que o "+" continua adicionando ao carrinho e mostrando toast agrupado.

---

## 🚫 Itens fora do escopo (para deixar claro)

- Nenhum redesign de checkout, carrinho drawer, upsell, ou página de pedido.
- Nenhuma mudança em fontes (Inter mantida; sem importar fontes novas para não impactar performance).
- Nenhuma animação pesada (sem parallax, sem blur grande, sem filtros caros).
- Nenhuma alteração em tokens globais — só `.public-menu-theme` e componentes públicos.

Pronto para aplicar quando aprovado.
