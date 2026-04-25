
# Configurações do Cardápio Online

Adicionar uma sub-aba dentro da aba **Online** do Admin para configurar tudo que envolve a operação online do restaurante. Hoje a aba Online só tem o gerenciamento de produtos — essas configurações ficam só no banco e não têm UI.

## Escopo (somente UI + chamadas a RPCs novas)

Não mexer em: `.exe`, bridge, `print_jobs`, `create_public_order`, Palm, PDV, Cozinha, Caixa, Telegram.

## 1. Reestruturar a aba Online

Em `OnlineMenuTab.tsx`, envolver o conteúdo em um `Tabs` interno com duas abas:

- **Cardápio** — o conteúdo atual (produtos online).
- **Configurações** — novo painel `OnlineSettingsPanel`.

## 2. Novo componente `OnlineSettingsPanel.tsx`

Quatro seções (cards) carregadas a partir de `restaurants`, `business_hours` e `delivery_zones` (slug `plano-b-espetaria`).

### 2.1 Status da loja
- Select `is_open_override`: **Automático (segue horários)** / **Forçar aberto** / **Forçar fechado**.
- Mostra ao lado um badge ao vivo do `is_restaurant_open` (RPC já existente).

### 2.2 Dados públicos
- Nome, descrição, WhatsApp, URL do logo, URL do hero, chave PIX.
- Upload de logo/hero usando o bucket `product-images` já configurado (mesmo padrão do EditDialog atual).

### 2.3 Horários de funcionamento
- Lista fixa de 7 linhas (Domingo → Sábado) usando `weekdayLabel` de `src/lib/public-menu.ts`.
- Cada linha: switch **Aberto/Fechado** + dois `Input type="time"` (abre / fecha).
- Validação leve: se aberto, `closes_at > opens_at`.
- Botão **Salvar horários** faz upsert em lote.

### 2.4 Tempo de preparo
- `default_prep_minutes` (input numérico).
- `delivery_prep_buffer` (input numérico, minutos extras para entrega).

### 2.5 Zonas de entrega
- Lista de `delivery_zones` com: nome, taxa, pedido mínimo, tempo estimado, bairros (chips separados por vírgula em `match_neighborhoods`), switch ativo.
- Botões **Adicionar zona**, **Editar**, **Remover**.
- Importante: hoje não há nenhuma zona cadastrada — sem isso o checkout de entrega bloqueia. Esse painel resolve.

## 3. Backend — novas RPCs (migration)

Como todas as tabelas envolvidas têm RLS bloqueando escrita pública, criar funções `SECURITY DEFINER` (mesmo padrão de `admin_update_product_online` já usado):

- `admin_update_restaurant(p_id uuid, p_name, p_description, p_whatsapp_phone, p_logo_url, p_hero_url, p_pix_key, p_is_open_override, p_default_prep_minutes, p_delivery_prep_buffer)` — campos opcionais, só atualiza os passados.
- `admin_upsert_business_hours(p_restaurant_id uuid, p_hours jsonb)` — recebe array `[{weekday, opens_at, closes_at, is_closed}]` e faz upsert em lote.
- `admin_upsert_delivery_zone(p_id uuid|null, p_restaurant_id, p_name, p_fee, p_min_order, p_estimated_minutes, p_match_neighborhoods text[], p_active)` — insert quando `p_id` nulo, update caso contrário.
- `admin_delete_delivery_zone(p_id uuid)`.

Validações dentro das funções: `closes_at > opens_at` quando `is_closed=false`, `fee >= 0`, `min_order >= 0`, `estimated_minutes > 0`, normalizar bairros (`trim`+`lower`).

Sem alterações em colunas — schema atual já cobre tudo.

## 4. Carregamento de dados no front

Hooks com TanStack Query:
- `["admin", "online-settings", "restaurant"]` → `restaurants` (single).
- `["admin", "online-settings", "hours"]` → `business_hours` ordenado por weekday.
- `["admin", "online-settings", "zones"]` → `delivery_zones` por restaurant.

Após cada mutação, `invalidateQueries` da chave correspondente + toast de sucesso/erro.

## 5. Critérios de aceite

- Aba Online passa a ter sub-abas **Cardápio** / **Configurações**.
- Em Configurações dá para: alternar status manual da loja, editar dados públicos, ajustar 7 dias de horários, definir tempos de preparo e gerenciar zonas de entrega.
- Mudanças refletem no `/menu/plano-b-espetaria` (status, horários no `HoursDialog`, hero/logo) e desbloqueiam delivery quando uma zona com o bairro do cliente é cadastrada.
- Nenhuma alteração em fluxo de impressão, Palm, PDV, Cozinha, Caixa, Telegram, bridge ou `.exe`.

## Arquivos

**Novos**
- `src/components/admin/OnlineSettingsPanel.tsx`
- `src/components/admin/online-settings/HoursEditor.tsx`
- `src/components/admin/online-settings/DeliveryZonesEditor.tsx`
- `src/components/admin/online-settings/RestaurantInfoEditor.tsx`
- `supabase/migrations/<timestamp>_admin_online_settings_rpcs.sql`

**Editados**
- `src/components/admin/OnlineMenuTab.tsx` — envelopa conteúdo atual em `Tabs` (Cardápio + Configurações).

---

# Fase 6 — Personalização visual do cardápio público (Admin)

Nova sub-aba **Personalizar** dentro de Online, permitindo ao usuário editar a aparência do cardápio público sem precisar pedir mudanças por chat.

## Restrições obrigatórias (aprovadas)

1. **Sem PIN novo.** Reaproveitar exatamente o padrão atual (`admin_*` `SECURITY DEFINER` sem `p_pin`, mesmo modelo de `admin_update_product_online` / `admin_update_restaurant`). NÃO introduzir um segundo modelo de auth.
2. **`public_menu_settings` é puramente cosmética.** Nunca pode influenciar: impressão, `print_jobs`, checkout, preços, `create_public_order`, regras de pedido, PDV/Palm/Cozinha/Caixa. Campos permitidos: layout, banner, cor de destaque, estilo de destaques, ordem de categorias, mensagem de boas-vindas, flags de exibição/ocultação visual.
3. **Preview em iframe seguro.** Reusar o cardápio real em modo `?preview=1`. Nesse modo: navegação e visualização permitidas; `addToCart`, `create_public_order` e qualquer mutação real bloqueadas; banner discreto "Modo preview" no topo.
4. **`accent_color` sanitizada.** Aceitar apenas hex válido `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`. Validar no front E na RPC. Sem CSS livre.
5. **`slug` editável com cuidado.** Validar `^[a-z0-9-]+$`, checar unicidade, e mostrar aviso claro de que o link público antigo deixa de funcionar. Atualizar via RPC dedicada (`admin_update_restaurant_slug`).
6. **Destaques rápidos.** Diálogo "Gerenciar destaques" usa `admin_update_product_online` passando APENAS `p_is_featured`. Nada além disso.
7. **Não tocar:** `.exe`, bridge, `print_jobs`, `create_public_order`, `orders`, checkout, PDV, Palm, Cozinha, Caixa.

## Schema novo

Tabela `public_menu_settings` (1:1 com `restaurants`):
- `restaurant_id uuid PK references restaurants(id)`
- `layout_mode text default 'list'` — `'list' | 'grid'`
- `accent_color text default '#E25822'` — validado hex
- `featured_style text default 'carousel'` — `'carousel' | 'grid' | 'hidden'`
- `category_order uuid[] default '{}'` — ordem custom (fallback: `menu_categories.display_order`)
- `welcome_message text`
- `show_descriptions boolean default true`
- `show_prices_on_card boolean default true`
- `banner_url text` — opcional, separado de `restaurants.hero_url`
- `updated_at timestamptz default now()`

RLS: SELECT público (true), nenhuma escrita pública (mesmo padrão de `restaurants`).

## RPCs novas (`SECURITY DEFINER`, sem PIN)

- `admin_update_public_menu_settings(p_restaurant_id, p_layout_mode, p_accent_color, p_featured_style, p_category_order uuid[], p_welcome_message, p_show_descriptions, p_show_prices_on_card, p_banner_url)` — todos opcionais. Valida `accent_color` regex, `layout_mode IN ('list','grid')`, `featured_style IN ('carousel','grid','hidden')`. Faz upsert.
- `admin_update_restaurant_slug(p_id uuid, p_new_slug text)` — valida regex `^[a-z0-9-]+$` e unicidade.
- `admin_set_product_featured(p_id uuid, p_is_featured boolean)` — wrapper fino sobre `admin_update_product_online` para deixar claro que destaques rápidos só mexem nesse campo.

## UI nova: aba `Personalizar`

Componente `PublicMenuCustomizer.tsx` com seções:

1. **Link & QR** — mostra `https://palm-order-pro.lovable.app/menu/<slug>`, botão copiar, QR code (lib `qrcode.react` ou `<img>` para `api.qrserver.com`). Editor de slug com validação e aviso.
2. **Identidade visual** — color picker (input `type="color"` + texto hex), upload de banner (bucket `product-images`), mensagem de boas-vindas.
3. **Layout** — radio `Lista` / `Grade`, switches `mostrar descrições` / `mostrar preços no card`.
4. **Destaques** — radio `Carrossel` / `Grade` / `Oculto` + botão "Gerenciar produtos em destaque" abrindo dialog com lista de produtos (somente toggle `is_featured`).
5. **Ordem das categorias** — drag-and-drop (`@dnd-kit`, já instalado) sobre `menu_categories`, salva em `category_order`.
6. **Preview ao vivo** — `<iframe src="/menu/<slug>?preview=1">` com toggles mobile/desktop (375px / 100%).

## Frontend público — consumir settings

- `fetchPublicMenuSettings(restaurantId)` em `src/lib/public-menu.ts`.
- `PublicMenu.tsx`: aplicar `accent_color` via CSS var (`--primary`), `welcome_message`, ordem de categorias, layout, banner.
- `ProductCard.tsx`: respeitar `layout_mode`, `show_descriptions`, `show_prices_on_card`.
- `FeaturedCarousel.tsx`: respeitar `featured_style`.

## Modo preview

Em `PublicMenu.tsx` e `PublicCheckout.tsx`:
- Detectar `new URLSearchParams(location.search).get('preview') === '1'`.
- Se preview: renderizar banner sticky "Modo preview — pedidos desativados", desabilitar botões `Adicionar ao carrinho` / `Finalizar pedido`, e curto-circuitar qualquer chamada a `create_public_order`.
- Iframe recebe `sandbox="allow-scripts allow-same-origin"` (sem `allow-forms` extra, sem `allow-top-navigation`).

## Ordem de implementação

1. Migration `public_menu_settings` + RPCs.
2. `fetchPublicMenuSettings` + aplicação no cardápio público (sem UI admin ainda).
3. Modo `?preview=1` no público.
4. Aba `Personalizar` no Admin (link/QR/slug primeiro).
5. Identidade visual + layout + destaques.
6. Drag-and-drop de categorias.
7. Iframe de preview.

## Critérios de aceite

- Admin consegue editar cor, banner, layout, destaques, ordem de categorias e mensagem direto da UI.
- Mudanças aparecem no `/menu/<slug>` sem deploy.
- `?preview=1` impede criação de pedido.
- `accent_color` inválida é rejeitada pela RPC.
- Slug duplicado é rejeitado pela RPC.
- Nenhuma alteração em `.exe`, bridge, `print_jobs`, `create_public_order`, PDV, Palm, Cozinha, Caixa.

## Arquivos

**Novos**
- `supabase/migrations/<ts>_public_menu_settings.sql`
- `src/components/admin/PublicMenuCustomizer.tsx`
- `src/components/admin/customizer/LinkAndQrCard.tsx`
- `src/components/admin/customizer/VisualIdentityCard.tsx`
- `src/components/admin/customizer/LayoutCard.tsx`
- `src/components/admin/customizer/FeaturedManagerDialog.tsx`
- `src/components/admin/customizer/CategoryOrderCard.tsx`
- `src/components/admin/customizer/LivePreviewCard.tsx`

**Editados**
- `src/components/admin/OnlineMenuTab.tsx` — adiciona aba `Personalizar`.
- `src/lib/public-menu.ts` — `fetchPublicMenuSettings` + tipo.
- `src/pages/PublicMenu.tsx` — consome settings + modo preview.
- `src/pages/PublicCheckout.tsx` — bloqueia envio em modo preview.
- `src/components/public-menu/ProductCard.tsx` — respeita layout/flags.
- `src/components/public-menu/FeaturedCarousel.tsx` — respeita `featured_style`.

