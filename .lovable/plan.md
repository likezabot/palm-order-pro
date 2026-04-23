

# Plano: eliminar erro de lazy load do Admin no preview Lovable

## Problema confirmado

- O `npx vite build` (produção) **passa sem erros** — o código do Admin está íntegro.
- No preview Lovable, o Vite dev-server invalida módulos com `?t=<timestamp>` a cada HMR. O `lazy(() => import("./pages/Admin"))` tenta buscar uma URL com timestamp **antigo** que já não existe mais → `TypeError: Failed to fetch dynamically imported module`.
- O `AdminErrorBoundary` + `lazyWithRetry` já tentam recuperar, mas o retry usa o **mesmo factory cacheado** do `lazy()`, que continua apontando para o timestamp invalidado → loop até desistir → tela de erro.

## Solução cirúrgica (1 arquivo, ~3 linhas)

**Trocar o lazy load do Admin por import estático em `src/App.tsx`.**

Justificativa:
- Admin é a rota onde o erro acontece de forma reproduzível.
- Import estático elimina 100% do problema de chunk fantasma (não há fetch dinâmico, o módulo entra no bundle inicial).
- Custo: o bundle inicial cresce ~206 kB (tamanho do chunk Admin atual). Aceitável — é uma rota de admin usada com frequência e o ganho de estabilidade compensa.
- Mantém `AdminErrorBoundary` no lugar (continua útil para erros de runtime dentro do Admin).
- Mantém lazy load nas outras rotas (Pdv, PrintStation, Stock, ForceUpdate, InstallPalm, InstallKitchen, NotFound) — elas não apresentam o problema.

## Mudança exata em `src/App.tsx`

**Remover:**
```ts
const Admin = lazyWithRetry(() => import("./pages/Admin"));
```

**Adicionar no topo, junto aos outros imports diretos:**
```ts
import Admin from "./pages/Admin";
```

Resto do arquivo intacto (Suspense, AdminErrorBoundary, rota `/admin`, demais lazy imports).

## Arquivos NÃO tocados

- `src/pages/Admin.tsx`
- `src/components/admin/AdminErrorBoundary.tsx`
- `src/components/admin/NetworkTab.tsx`
- Qualquer coisa de impressão, PDV, Palm, Kitchen, bridge, Telegram, Supabase.

## Resultado prático

- Preview Lovable: Admin abre instantaneamente, sem erro de chunk dinâmico, mesmo após edições/HMR.
- Produção: continua funcionando (era o que já funcionava).
- Bundle inicial fica ~206 kB maior — sem impacto perceptível em conexões normais.

