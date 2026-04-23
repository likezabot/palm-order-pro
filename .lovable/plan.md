

# Plano: alinhar últimas inconsistências do Admin ao padrão "Rede"

## Diagnóstico

A maior parte do Admin já segue o padrão Premium da aba Rede (Card shadcn + ícone em círculo `bg-primary/10` + tokens semânticos + botões `h-10/11`). Faltam **3 ajustes pontuais** que ainda destoam:

### 1. `ProductsManager.tsx` (Cardápio) — principal ofensor
- `<button>` cru com `font-bold uppercase`, pílulas custom em vez de `Button`/`ToggleGroup` shadcn.
- Toolbar sticky sem header de seção (ícone em círculo + título + descrição).
- Empty state com `border-2 border-dashed` (padrão antigo).
- Tabs de categoria (Espetos / Bebidas …) como pílulas custom — destoam do resto do Admin.
- Botões "A-Z / Grupos / Novo" usando classes manuais em vez de `Button variant="outline"` / `default`.

### 2. `OrdersTab.tsx` — refinamento mínimo
- Ícone do header está em `p-2` (8px). Outros tabs usam `p-2.5` para um pouco mais de presença. Padronizar.

### 3. `StatsPanel.tsx` — header de seção ausente
- Não tem o header padrão "ícone em círculo + título + descrição" no topo.
- Adicionar um `SectionHeader` com `BarChart3` + "Estatísticas" + descrição curta antes dos KPIs.

## Mudanças por arquivo

### `src/components/admin/ProductsManager.tsx` (refactor visual)

**Toolbar (sticky)**
- Wrap dentro de um `Card` com `SectionHeader` (ícone `Package` em `bg-primary/10` + título "Cardápio" + descrição "Gerencie produtos, preços e visibilidade").
- Trocar fundo `bg-background border-b` por `bg-card/50 backdrop-blur` mantendo sticky.

**Filtros de status (Todos/Visíveis/Ocultos)**
- Trocar `<div>` + `<button>` custom por componente `ToggleGroup` shadcn (`type="single"`).
- Sem `font-bold` — usar `font-medium`.

**Tabs de categoria**
- Trocar pílulas custom por `Button variant={active ? "default" : "outline"} size="sm"` em flex horizontal. Mantém scroll horizontal.
- Contador como `Badge` ao lado do nome.

**Botões da toolbar da categoria (A-Z / Grupos / Novo / Selecionar / Limpar)**
- Todos viram `Button` shadcn:
  - Selecionar → `variant="outline"` (ou `"default"` quando ativo).
  - A-Z → `variant="secondary" size="sm"`.
  - Grupos → `variant="outline" size="sm"`.
  - Novo → `variant="default" size="sm"` (já é a ação primária).
  - Limpar → `variant="ghost" size="sm"`.
- Altura uniforme `h-9`, ícones 16px, sem `font-bold uppercase`.

**Empty state**
- Trocar `border-2 border-dashed` por `Card` shadcn com:
  - Ícone grande em círculo `bg-muted p-4`.
  - Texto em `text-sm text-muted-foreground`.
  - Mesmo padrão do empty state do `OrdersTab`.

**Header de busca (quando ativo)**
- Trocar `text-xs font-black uppercase` por `text-sm font-semibold text-foreground` + contador como `Badge variant="secondary"`.

### `src/components/admin/OrdersTab.tsx`
- Trocar `<div className="rounded-full bg-primary/10 p-2">` por `p-2.5` (alinhar ao SystemTab/PrintConfig que usam `p-2`, na verdade já estão consistentes — manter `p-2`, só padronizar o **tamanho do ícone interno** para `w-5 h-5` se SectionHeader usar isso). Conferir e padronizar para `p-2 + w-4 h-4` em **todos** (já é o caso, mudança mínima de uma linha se necessário).

### `src/components/admin/StatsPanel.tsx`
- Adicionar no topo do componente (antes dos seletores de período) o mesmo `SectionHeader`:
  ```tsx
  <div className="flex items-start gap-3 mb-6">
    <div className="rounded-full bg-primary/10 p-2 shrink-0">
      <BarChart3 className="w-4 h-4 text-primary" />
    </div>
    <div>
      <h2 className="text-base font-semibold tracking-tight text-foreground">Estatísticas</h2>
      <p className="text-xs text-muted-foreground">Vendas, garçons e produtos no período</p>
    </div>
  </div>
  ```

## Princípios reforçados (DNA "Rede")

- Toda seção começa com **ícone em círculo `bg-primary/10` + título `text-base font-semibold` + descrição `text-xs text-muted-foreground`**.
- Sem `font-black uppercase`, sem `<button>` cru — sempre `Button` shadcn.
- Empty state sempre como `Card` com ícone em círculo `bg-muted`.
- Tokens semânticos exclusivamente.

## Resultado prático

- A aba **Cardápio** deixa de ser a "estranha" do Admin — alinha com Pedidos/Impressão/Sistema/Rede.
- **Estatísticas** ganha header consistente.
- Toolbar de produtos com hierarquia clara: Card → SectionHeader → busca/filtros → tabs categoria → ações.
- Visualmente, navegar entre abas vira uma experiência fluida sem quebra de estilo.

