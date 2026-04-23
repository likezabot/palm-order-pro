

# Plano: tela branca total no preview — reverter Admin pra lazy + matar service worker antigo

## Causa real

A tela está **100% branca** (sem nem o "Carregando…"), o que prova que o `index.html` carregou mas o JS do bundle nunca executou. Build de produção e TypeScript estão limpos. Restam duas causas plausíveis:

1. **Service Worker antigo** (`public/sw.js`) está servindo um `index.html` em cache que referencia um chunk JS que não existe mais após a última mudança de bundle.
2. O **import estático do Admin** (mudança da resposta anterior) inflou o `index-*.js` para 523 kB e juntou todo o código do admin no bundle inicial — qualquer falha de carregamento do bundle agora derruba o app inteiro, não só `/admin`.

A combinação das duas é o que produziu "deu pau em tudo".

## Correção (2 mudanças cirúrgicas, 1 arquivo + 1 linha extra)

### Mudança 1 — Voltar Admin pro lazy load com retry forte (`src/App.tsx`)

Reverter o import estático do Admin. Isolar o Admin de novo num chunk próprio para que **falha no Admin não quebre o bundle inicial**.

- Remover: `import Admin from "./pages/Admin";`
- Adicionar: `const Admin = lazyWithRetry(() => import("./pages/Admin"));`
- Manter `AdminErrorBoundary` envolvendo a rota — ele já tem retry automático e botão de reload.

Isso restaura o estado de **antes** da última mudança, que é onde o app inteiro funcionava (só `/admin` dava o erro de chunk fantasma, e mesmo assim o `AdminErrorBoundary` recuperava).

### Mudança 2 — Forçar SW a se desregistrar uma vez (`src/main.tsx`)

Adicionar um pequeno bloco no `main.tsx` que, na primeira carga após o deploy, força `navigator.serviceWorker.getRegistrations()` → `unregister()` + `caches.delete()` e dá `location.reload()` **uma única vez** (controlado por flag em `localStorage`). Isso garante que qualquer SW cacheando bundle velho seja limpo no próximo acesso do usuário.

Pseudocódigo:
```ts
const SW_RESET_KEY = "sw-reset-2026-04-23";
if (typeof window !== "undefined" && !localStorage.getItem(SW_RESET_KEY)) {
  localStorage.setItem(SW_RESET_KEY, "1");
  navigator.serviceWorker?.getRegistrations().then(rs => {
    Promise.all(rs.map(r => r.unregister()))
      .then(() => caches?.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))))
      .then(() => location.reload());
  });
}
```

Roda **uma vez por dispositivo**, depois fica inerte. Sem impacto em performance.

## Resultado esperado

- Bundle inicial volta a ~317 kB (sem o Admin embutido). App carrega normalmente em qualquer rota.
- Service worker antigo é purgado uma vez → próxima carga pega `index.html` fresco que referencia os chunks atuais.
- `/admin` volta ao comportamento anterior: lazy load + ErrorBoundary cobrindo qualquer falha de chunk dinâmico.
- Preview Lovable e produção ficam estáveis.

## Arquivos NÃO tocados

- `src/pages/Admin.tsx`, `src/components/admin/*`
- `public/sw.js` (a lógica fica no app, não no SW)
- Qualquer coisa de impressão, PDV, Palm, Kitchen, bridge, Telegram, Supabase

