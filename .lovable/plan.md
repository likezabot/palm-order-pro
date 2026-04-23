

# Plano: harmonia visual Premium em todo o Admin

## Diagnóstico

Hoje a aba "Rede" segue um padrão **clean / Premium** (cards `shadcn` com `border` sutil, fundo branco, ícones em círculo `bg-primary/10`, status semântico via tokens `--success/--warning/--destructive`, tipografia equilibrada). O resto do Admin usa um padrão **antigo "POS pesado"**:

- `font-black uppercase` em quase tudo
- Bordas grossas (`border-2`), botões `h-14` com sombras coloridas
- Header com `shadow-sm` + título caixa-alta
- Tabs com `text-xs font-bold` apertadas
- Cores hardcoded (`text-slate-900`, `bg-slate-50/50`)
- Aba Pedidos / Sistema / Impressão sem hierarquia visual consistente

Objetivo: trazer **toda a aba Admin** pro mesmo idioma visual da Rede — mantendo legibilidade no balcão, mas com refinamento.

## Princípios do novo design (do NetworkTab)

1. **Tipografia balanceada**: `font-semibold` / `font-bold` em vez de `font-black`. Sem uppercase forçado em títulos. Números em `tabular-nums`.
2. **Cards uniformes**: `Card` do shadcn, `border` simples (não `border-2`), `rounded-lg`, padding `p-4/p-5`.
3. **Ícone em círculo `bg-primary/10`** como marca visual recorrente em headers de seção.
4. **Status via dots pequenos** (8px) + cor semântica de token, sem bolões.
5. **Cores semânticas exclusivas**: `text-success / text-warning / text-destructive / text-muted-foreground` — sem `text-slate-*` hardcoded.
6. **Botões**: altura padrão `h-10/h-11`, `rounded-md`, sem sombras coloridas chamativas. Ações destrutivas usam `variant="destructive"` discreto.
7. **Background**: `bg-background` (branco/neutro do tema) em vez de `bg-slate-50/50`. Espaçamento interno generoso (`max-w-4xl mx-auto py-6 space-y-6`).
8. **Tabs**: pill style sutil com underline animado mais fino, ícone + label sempre, sem `font-bold` agressivo.

## Mudanças por arquivo

### `src/pages/Admin.tsx`
- Trocar `bg-slate-50/50` → `bg-background`.
- Tabs: trocar `h-14 font-bold text-xs sm:text-sm` por `h-12 font-medium text-sm`, espaçamento `gap-1`, underline mais sutil (`border-b border-transparent data-[state=active]:border-primary` permanece, mas dentro de uma `TabsList` com `bg-muted/30 rounded-none`).
- Wrapper das `TabsContent` ganha `max-w-5xl mx-auto w-full px-4 sm:px-6 py-6` para alinhar largura entre todas as abas.

### `src/components/admin/AdminHeader.tsx`
- Título: `text-lg sm:text-xl font-semibold tracking-tight` (sem `font-black uppercase`). "Painel de Controle" em todos os tamanhos (responsivo encolhe).
- Botão "Novo Produto": altura `h-10`, `rounded-md`, sem `shadow-lg shadow-primary/20`. Ícone `Plus` 16px.
- Toggle Garçom/Admin: virar `Badge`/`Button` com `variant="outline"` + ícone, sem caixa-alta forçada.
- Voltar: ícone num botão `ghost size="icon"` do shadcn em vez de `<button>` cru.
- Borda inferior: `border-b` simples (sem `shadow-sm`).

### `src/components/admin/OrdersTab.tsx`
- Cards de pedido: trocar `border border-border rounded-xl shadow-sm` por `Card` shadcn.
- Título "Mesa X": `text-base font-semibold` (sem `font-black`).
- Total: `text-xl font-bold tabular-nums text-primary` + label "Total" pequeno acima em `text-xs text-muted-foreground`.
- Garçom vira `Badge variant="secondary"` com avatar dot.
- Botões "Imprimir/Editar": `Button variant="outline"` e `variant="default"`, altura `h-10`, ícones 16px.
- Empty state: card com ícone grande em círculo `bg-muted` + texto centralizado em `text-muted-foreground`.
- Header da seção (acima do grid): linha "Pedidos ativos · N" com contador em `Badge`.

### `src/components/admin/SystemTab.tsx`
- Já está próximo do padrão, refinar:
  - Trocar `text-slate-900/600/500` → `text-foreground/text-muted-foreground`.
  - `border-2 border-border` → `border` (Card shadcn).
  - `font-black` → `font-semibold`.
  - Botões `h-14 font-black uppercase` → `h-11 font-medium` com ícone à esquerda.
  - Logs: cada item vira mini-Card com dot semântico (`success`/`destructive`) em vez de borda colorida grossa.
  - Header de cada seção igual ao NetworkTab: ícone em círculo `bg-primary/10` + título `text-base font-semibold` + descrição `text-sm text-muted-foreground`.

### `src/components/admin/PrintConfigPanel.tsx`
- Envolver seções num `Card` cada (Bridge status, Modo de impressão, Layout, Fontes, Seções visíveis, Preview).
- Header de seção com mesmo padrão (ícone em círculo + título semibold).
- Status da bridge: trocar bloco verde/vermelho atual por banner igual ao "summary" do NetworkTab (`bg-success/5 border-success/20` ou `bg-destructive/5`).
- Botões "Salvar/Resetar": `h-10`, sem `font-black`.

### `src/components/admin/StatsPanel.tsx`
- Cards de KPI (Faturamento, Pedidos, Ticket Médio, Produtos): padrão uniforme — Card shadcn com label `text-xs uppercase tracking-wide text-muted-foreground`, valor `text-3xl font-bold tabular-nums`, delta com seta colorida (success/destructive token).
- Header do período: pílulas (`Tabs` ou `ToggleGroup`) com visual sutil em vez de botões grandes.
- Gráficos (recharts): manter, mas envolver em `Card` com `CardHeader` + `CardTitle` consistente.
- Tabelas (top produtos / garçons): linhas com `hover:bg-muted/50`, fonte `text-sm`, números `tabular-nums`.

### Tokens / `src/index.css`
- Verificar se `--success` e `--warning` já existem (NetworkTab usa). Se faltarem em algum modo, adicionar.
- Sem novas variáveis necessárias além disso.

## Layout-padrão de seção (template aplicado em tudo)

```text
┌─ Card ─────────────────────────────────────┐
│ ⚙️  Título da seção                        │  ← ícone em círculo bg-primary/10
│    Descrição curta em muted-foreground     │
├────────────────────────────────────────────┤
│ [conteúdo da seção]                        │
│ [Ação primária]  [Ação secundária]         │
└────────────────────────────────────────────┘
```

Espaçamento entre cards: `space-y-6`. Container: `max-w-4xl mx-auto`.

## Resultado prático

- Admin inteiro com **mesma DNA visual** da aba Rede: clean, denso, semântico.
- Sem `font-black uppercase` em títulos — leitura mais agradável.
- Cards uniformes em todas as abas (Cardápio, Pedidos, Impressão, Estatísticas, Sistema, Rede).
- Status sempre via tokens semânticos — pronto pra dark mode futuro.
- Botões mais discretos, hierarquia clara entre ação primária / secundária / destrutiva.
- Funciona igual bem em celular (441px) e desktop, mantendo o min 56px de toque nos botões críticos onde já existia.

