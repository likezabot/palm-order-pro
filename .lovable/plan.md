
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
