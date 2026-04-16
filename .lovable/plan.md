

## Diagnóstico

O SW atual (`plano-b-v3`) já tem `skipWaiting`, `clients.claim`, network-first para navegação, e o `main.tsx` já faz reload no `controllerchange`. Mas o problema persiste porque:

1. **O `CACHE_NAME` é estático no `sw.js`** — como `sw.js` é servido do `/public` sem hash, o navegador pode usar a cópia em cache do próprio `sw.js` (byte-equal = sem update detectado).
2. **Não há verificação de versão no app** — se o SW não atualizar, o app não sabe que está desatualizado.
3. **Falta feedback visual** — o usuário não vê nada quando uma atualização está disponível.

## Plano

### 1. Criar `APP_VERSION` via Vite build

No `vite.config.ts`, injetar uma variável global com timestamp do build:

```typescript
define: {
  __APP_VERSION__: JSON.stringify(new Date().toISOString()),
}
```

Isso garante que cada build gera uma versão única, sem precisar alterar manualmente.

### 2. Criar `src/lib/version-check.ts`

Módulo que:
- Compara `__APP_VERSION__` com `localStorage.getItem("app_version")`
- Se diferente: limpa todos os caches (`caches.keys()` → `caches.delete()`), salva nova versão, retorna `true`
- Se igual: retorna `false`

### 3. Atualizar `src/main.tsx`

- Importar e executar `checkVersion()` **antes do render**
- Se versão mudou: limpar caches, desregistrar SW antigo, fazer `location.reload()` uma vez (com flag para evitar loop)
- Se versão igual: continuar normalmente, registrar SW

### 4. Criar componente `src/components/UpdateBanner.tsx`

Banner discreto que aparece quando o SW detecta atualização disponível:
- "Nova versão disponível. Atualizando..."
- Auto-reload após 2 segundos, ou botão "Atualizar agora" como fallback

### 5. Atualizar `public/sw.js`

- Injetar timestamp como comentário no topo (via Vite plugin simples ou script) para que o arquivo nunca seja byte-equal entre deploys
- Alternativa mais simples: no `vite.config.ts`, copiar `sw.js` como parte do build com versão injetada

### 6. Integrar `UpdateBanner` no `App.tsx`

Renderizar o banner globalmente, acima das rotas.

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `vite.config.ts` | Adicionar `define: { __APP_VERSION__ }` |
| `src/lib/version-check.ts` | **Novo** — lógica de comparação e limpeza |
| `src/main.tsx` | Verificar versão antes do render, limpar cache se mudou |
| `src/components/UpdateBanner.tsx` | **Novo** — banner "Nova versão disponível" |
| `src/App.tsx` | Adicionar `<UpdateBanner />` |
| `public/sw.js` | Adicionar versão dinâmica no comentário do topo via build |
| `src/vite-env.d.ts` | Declarar tipo `__APP_VERSION__` |

### Segurança

- Não apaga `localStorage` inteiro — apenas a chave `app_version`
- Não apaga cookies ou dados de autenticação
- Limpa apenas Cache API (caches do SW)

