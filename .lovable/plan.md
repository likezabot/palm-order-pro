
## Análise

O projeto já tem uma estrutura PWA bem montada com **dois manifests separados**:

- `public/manifest.json` → start_url `/` (home, instalação genérica)
- `public/manifest-palm.json` → start_url `/palm` (atendimento)
- `public/manifest-kitchen.json` → start_url `/kitchen` (cozinha)

Em `src/pages/InstallPalm.tsx` já existe a troca dinâmica do `<link rel="manifest">` para `manifest-palm.json` antes do prompt de instalação. Ou seja: **quem instala pela rota `/install-palm` já recebe um app que abre em `/palm`**.

O pedido do usuário é tornar `/palm` o destino padrão também para quem instalar pelo `manifest.json` principal — porque hoje, se o garçom instalar pela home, o app abre em `/`.

## Solução proposta (mínima e segura)

A forma mais simples e correta: **mudar o `start_url` do `manifest.json` principal de `/` para `/palm`**. Justificativa:

1. O público real instalando no celular é o garçom (uso primário do sistema).
2. Os instaladores especializados (`/install-kitchen`, `/install-palm`) continuam funcionando porque trocam o manifest dinamicamente.
3. A home (`/`) continua acessível por navegação dentro do PWA — `scope: "/"` já garante isso.

### Mudanças

| Arquivo | Mudança |
|---|---|
| `public/manifest.json` | `start_url: "/"` → `"/palm"`, `id: "/"` → `"/palm"`, atualizar `name`/`description` para refletir foco em atendimento |
| `public/sw.js` | Adicionar `/palm` (e opcionalmente `/`, `/kitchen`) ao array `ASSETS` precachado para abertura offline mais rápida |
| `index.html` | Atualizar `<title>` e meta description para refletir foco em atendimento (opcional, cosmético) |

### O que NÃO muda

- `scope: "/"` permanece — todas as rotas internas (`/cashier`, `/admin`, `/kitchen`, `/`) continuam dentro do PWA.
- `manifest-palm.json` e `manifest-kitchen.json` permanecem — `/install-palm` e `/install-kitchen` continuam funcionando como hoje.
- Service worker, lógica de cache, registro condicional (iframe/preview), banner de update — tudo intacto.
- Roteamento React Router intacto.

### Observações sobre o SW

O `sw.js` faz **network-first** para navegação (`req.mode === "navigate"`), então adicionar `/palm` ao array `ASSETS` só ajuda no fallback offline. O HTML servido em `/palm` é o mesmo `index.html` (SPA), então na prática o cache de `/index.html` já cobre tudo. Vou adicionar `/palm` ao precache mesmo assim para garantir abertura instantânea sem rede no primeiro toque após instalar.

### Bump de versão do SW

O `BUILD_STAMP` no `sw.js` é injetado pelo `vite.config.ts` em cada build, então qualquer alteração no arquivo já força reativação automática nos dispositivos com PWA antiga instalada — o `UpdateBanner.tsx` cuida do reload. Sem ação extra necessária.

### Como testar após deploy

1. Desinstalar PWA antiga do celular (se houver) — `start_url` é cache-ado pelo SO no momento da instalação e só atualiza ao reinstalar.
2. Abrir URL publicada no Chrome Android.
3. Menu → "Instalar app".
4. Abrir o ícone na home — deve abrir direto em `/palm`.

> Nota importante para o usuário: dispositivos que já têm o PWA instalado **vão continuar abrindo em `/`** até serem desinstalados/reinstalados. Isso é comportamento do sistema operacional, não do código.

### Sobre a versão .exe (Codex)

Não há nada a sincronizar do lado web — a versão .exe consome o mesmo bundle. Se a .exe usa um wrapper (Electron/Tauri) com URL inicial fixa, essa URL precisa ser ajustada do lado do wrapper, fora do escopo desta tarefa Lovable.

## Arquivos editados

- `public/manifest.json`
- `public/sw.js`
- `index.html` (cosmético, opcional)
