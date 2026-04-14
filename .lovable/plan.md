
# Plano: Tornar o App Instalável (PWA Simples)

## Resultado do Teste

O fluxo do Palm foi testado com sucesso:
- Identificação do garçom funciona
- Grid de mesas com 10 mesas + Balcão separado ok
- Criação de pedido no balcão: card aparece com horário, valor, status e garçom
- Criação de pedido na mesa: mesa 3 ficou vermelha com nome do garçom e valor
- Fluxo completo: Grid → Menu → Review → Finalizar → volta ao Grid (2 cliques)

## Tornar Instalável

O app já tem `manifest.json` com `display: standalone` e `theme-color`. Faltam apenas ajustes para atender os requisitos mínimos de instalação do Chrome/Safari:

### 1. Gerar ícones PWA (192x192 e 512x512)
- Criar ícones PNG com o logo/tema do Plano B (laranja #E25822 sobre fundo escuro #0D0D0D)
- Salvar em `public/icon-192.png` e `public/icon-512.png`

### 2. Atualizar `public/manifest.json`
- Adicionar ambos os ícones (192 e 512) como PNG
- Adicionar `"id": "/"` para identificação estável

### 3. Atualizar `index.html`
- Adicionar `<link rel="apple-touch-icon">` para iOS
- Adicionar `<meta name="apple-mobile-web-app-capable" content="yes">`
- Adicionar `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`

### 4. Sem service worker
Instalabilidade não requer service worker — apenas manifest + ícones + HTTPS. O app já roda em HTTPS via Lovable. Sem `vite-plugin-pwa` para evitar problemas no preview.

### Arquivos

| Arquivo | Ação |
|---|---|
| `public/icon-192.png` | Criar — ícone PWA 192x192 |
| `public/icon-512.png` | Criar — ícone PWA 512x512 |
| `public/manifest.json` | Atualizar — adicionar ícones PNG |
| `index.html` | Atualizar — meta tags Apple |
