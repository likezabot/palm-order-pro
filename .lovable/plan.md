# Melhorar preview do link no WhatsApp (meta tags Open Graph)

## Objetivo
Quando o link do cardápio for compartilhado no WhatsApp (ou qualquer rede), aparecer um preview bonito com título, descrição e logo da Plano B — em vez de "Sistema de atendimento Plano B Espetaria" + ícone genérico.

## Escopo
**Apenas visual/SEO.** Zero mexida em lógica, pedidos, checkout, impressão, bridge, Electron ou EXE.

## Arquivo alterado
- `index.html` — atualizar/adicionar meta tags Open Graph

## Mudanças exatas

**Antes:**
```html
<title>Plano B Espetaria</title>
<meta name="description" content="Sistema de atendimento Plano B Espetaria">
<meta property="og:title" content="Plano B Espetaria">
<meta name="twitter:title" content="Plano B Espetaria">
<meta property="og:description" content="Sistema de atendimento Plano B Espetaria">
<meta name="twitter:description" content="Sistema de atendimento Plano B Espetaria">
<meta name="twitter:card" content="summary">
<meta property="og:image" content="/icon-512.png">
```

**Depois:**
```html
<title>Plano B Espetaria - Cardápio Online</title>
<meta name="description" content="Cardápio do Plano B Espetaria. Espetos, refeições, bebidas e cervejas. Peça agora pelo nosso cardápio online.">
<meta property="og:title" content="Plano B Espetaria - Cardápio Online">
<meta name="twitter:title" content="Plano B Espetaria - Cardápio Online">
<meta property="og:description" content="Cardápio do Plano B Espetaria. Espetos, refeições, bebidas e cervejas. Peça agora pelo nosso cardápio online.">
<meta name="twitter:description" content="Cardápio do Plano B Espetaria. Espetos, refeições, bebidas e cervejas. Peça agora pelo nosso cardápio online.">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:image" content="/icon-512.png">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta property="og:site_name" content="Plano B Espetaria">
<meta property="og:locale" content="pt_BR">
```

## O que isso resolve
- **Título**: "Plano B Espetaria - Cardápio Online" (foco no cliente, não em "atendimento interno").
- **Descrição**: fala de espetos/bebidas/refeições, convidando a pedir.
- **Imagem**: continua o `icon-512.png` como você pediu, agora com `width/height` declarados.
- **`og:site_name`** e **`og:locale`** ajudam o WhatsApp a formatar em pt-BR.

## ⚠️ Importante sobre a URL
O preview só vai aparecer correto quando você compartilhar a **URL publicada** (`https://palm-order-pro.lovable.app`), NÃO a URL `id-preview--...lovable.app` do editor. Esta última é bloqueada pelo Lovable e sempre mostra "Lovable - Build for the web 20x faster".

Sempre que enviar pro cliente: copie da aba publicada, não do editor.

## Cache do WhatsApp
O WhatsApp guarda o preview antigo por horas/dias. Pra forçar atualização depois da mudança:
- Mande a URL com `?v=2` no final no primeiro teste (ex: `https://palm-order-pro.lovable.app/?v=2`), ou
- Use o Facebook Sharing Debugger (https://developers.facebook.com/tools/debug/) colando sua URL e clicando "Scrape Again".

## O que NÃO será alterado
- Nenhum componente React
- Nenhuma lógica de pedidos, carrinho, checkout, impressão
- Nenhum arquivo de Supabase, edge function, bridge, Electron, EXE
- Nenhum `print_jobs` ou payload