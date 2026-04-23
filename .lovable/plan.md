

# Plano: limpeza segura de código morto (sem refatoração estrutural)

## Escopo

Remover **apenas** linhas comprovadamente não utilizadas, sem tocar em:
- Animações (`animate-fade-in`, transitions, keyframes)
- Layout, estilos, tokens de tema
- Lógica de impressão, PDV, Palm, Kitchen, bridge, Telegram, Supabase
- `AdminErrorBoundary` e fluxo de recuperação do Admin

## O que será removido

### 1. `src/App.tsx`
- **`lazyWithRetry`**: helper que envolvia `lazy()` com retry de 600ms. Hoje o `AdminErrorBoundary` já faz hard reload da rota com guard de sessão, então o retry interno virou código morto. Vou trocar `Admin = lazyWithRetry(...)` por `Admin = lazy(...)` direto e apagar a função `lazyWithRetry` inteira.
- Sem mudança em nenhuma outra rota, Suspense, BrowserRouter ou animação.

### 2. `src/main.tsx`
- **Bloco "One-time SW + caches purge" (`SW_RESET_KEY = "sw-reset-2026-04-23"`)**: já rodou uma vez por dispositivo e ficou inerte. Mantém apenas peso visual no arquivo. Vou remover o bloco inteiro (try/catch + lógica de unregister + reload).
- Mantém intactos: anti-flash de tema, alto contraste, `debugLog`, `checkAndUpdateVersion`, `createRoot`, `startPrintQueueWorker`, `startConnectivityMonitor`, `startGlobalOrderRuntime`, registro de SW para produção.

## O que NÃO será mexido

- `AdminErrorBoundary.tsx` — fica como está (é o que está segurando o Admin hoje).
- `pages/Admin.tsx` e qualquer componente do admin.
- `public/sw.js`, `lib/version-check.ts`, `lib/print-*`, `lib/global-order-runtime.ts`.
- Qualquer hook, util ou componente de Palm/Kitchen/PDV/Stock.
- Animações: `animate-fade-in` no wrapper de rotas continua.

## Arquivos editados

- `src/App.tsx` — remover `lazyWithRetry`, usar `lazy` direto no Admin.
- `src/main.tsx` — remover bloco de purge de SW one-time.

## Resultado

- Menos ~25 linhas de código morto.
- Zero mudança de comportamento visível: Admin continua lazy + protegido pelo ErrorBoundary, animações intactas, SW de produção intacto.
- Bundle ligeiramente menor.

