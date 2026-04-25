
-- ============================================================
-- FASE 0 — Cardápio público (aditiva, não destrutiva)
-- ============================================================

-- ---------- 1) ALTER products (aditivo) ----------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_available_online boolean NOT NULL DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- ---------- 2) ALTER orders (aditivo) ----------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'palm';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'dine_in';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name_snapshot text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone_snapshot text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rejected_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS public_token uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS change_for numeric;

-- ---------- 3) Tabelas novas ----------

CREATE TABLE IF NOT EXISTS public.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  hero_url text,
  description text,
  whatsapp_phone text,
  pix_key text,
  default_prep_minutes integer NOT NULL DEFAULT 25,
  delivery_prep_buffer integer NOT NULL DEFAULT 10,
  is_open_override text NOT NULL DEFAULT 'auto', -- 'auto' | 'open' | 'closed'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time,
  closes_at time,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_hours_rest_day ON public.business_hours(restaurant_id, weekday);

CREATE TABLE IF NOT EXISTS public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, slug)
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  total_orders integer NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  zip text,
  reference text,
  delivery_zone_id uuid,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON public.customer_addresses(customer_id);

CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  fee numeric NOT NULL DEFAULT 0,
  min_order numeric NOT NULL DEFAULT 0,
  estimated_minutes integer NOT NULL DEFAULT 30,
  match_neighborhoods text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text
);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON public.order_status_history(order_id, changed_at DESC);

-- ---------- 4) Índices em orders ----------
CREATE INDEX IF NOT EXISTS idx_orders_channel_status_created ON public.orders(channel, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON public.orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_service_type ON public.orders(service_type, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_public_token ON public.orders(public_token) WHERE public_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_online ON public.products(category, display_order) WHERE active AND is_available_online;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

-- ---------- 5) RLS ----------
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY restaurants_select ON public.restaurants FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY business_hours_select ON public.business_hours FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY menu_categories_select ON public.menu_categories FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY delivery_zones_select ON public.delivery_zones FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY order_status_history_select ON public.order_status_history FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- customers/customer_addresses: SEM policy de select público (LGPD). Acesso só via SECURITY DEFINER RPCs.
DO $$ BEGIN
  CREATE POLICY customers_no_public ON public.customers FOR ALL USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY customer_addresses_no_public ON public.customer_addresses FOR ALL USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- 6) Helpers ----------

CREATE OR REPLACE FUNCTION public.is_restaurant_open(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override text;
  v_now_sp timestamptz;
  v_weekday smallint;
  v_time time;
  v_row record;
BEGIN
  SELECT is_open_override INTO v_override FROM public.restaurants WHERE id = p_restaurant_id;
  IF v_override = 'open' THEN RETURN true; END IF;
  IF v_override = 'closed' THEN RETURN false; END IF;

  v_now_sp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_weekday := EXTRACT(DOW FROM v_now_sp)::smallint;
  v_time := (v_now_sp)::time;

  SELECT * INTO v_row
  FROM public.business_hours
  WHERE restaurant_id = p_restaurant_id AND weekday = v_weekday
  LIMIT 1;

  IF v_row.id IS NULL OR v_row.is_closed THEN RETURN false; END IF;
  IF v_row.opens_at IS NULL OR v_row.closes_at IS NULL THEN RETURN false; END IF;

  -- suporte a horários que cruzam meia-noite
  IF v_row.closes_at > v_row.opens_at THEN
    RETURN v_time >= v_row.opens_at AND v_time <= v_row.closes_at;
  ELSE
    RETURN v_time >= v_row.opens_at OR v_time <= v_row.closes_at;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_customer(p_phone text, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_phone text;
  v_id uuid;
BEGIN
  v_clean_phone := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  IF length(v_clean_phone) < 10 THEN RAISE EXCEPTION 'invalid_phone'; END IF;

  SELECT id INTO v_id FROM public.customers WHERE phone = v_clean_phone;
  IF v_id IS NOT NULL THEN
    UPDATE public.customers
       SET name = COALESCE(NULLIF(trim(p_name),''), name),
           updated_at = now()
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.customers (phone, name)
  VALUES (v_clean_phone, NULLIF(trim(p_name),''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_delivery_fee(
  p_restaurant_id uuid,
  p_neighborhood text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_zone record;
  v_neighborhood_norm text;
BEGIN
  v_neighborhood_norm := lower(trim(coalesce(p_neighborhood,'')));
  IF v_neighborhood_norm = '' THEN
    RETURN jsonb_build_object('fee', 0, 'zone_id', NULL, 'min_order', 0, 'estimated_minutes', NULL, 'matched', false);
  END IF;

  SELECT * INTO v_zone
  FROM public.delivery_zones
  WHERE restaurant_id = p_restaurant_id
    AND active = true
    AND EXISTS (
      SELECT 1 FROM unnest(match_neighborhoods) n
      WHERE lower(trim(n)) = v_neighborhood_norm
    )
  ORDER BY fee ASC LIMIT 1;

  IF v_zone.id IS NULL THEN
    RETURN jsonb_build_object('fee', 0, 'zone_id', NULL, 'min_order', 0, 'estimated_minutes', NULL, 'matched', false);
  END IF;

  RETURN jsonb_build_object(
    'fee', v_zone.fee,
    'zone_id', v_zone.id,
    'min_order', v_zone.min_order,
    'estimated_minutes', v_zone.estimated_minutes,
    'matched', true
  );
END;
$$;

-- ---------- 7) RPC create_public_order ----------

CREATE OR REPLACE FUNCTION public.create_public_order(
  p_restaurant_slug text,
  p_service_type text,             -- 'delivery' | 'takeout' | 'dine_in'
  p_customer_phone text,
  p_customer_name text,
  p_address jsonb,                 -- {street, number, complement, neighborhood, city, zip, reference}
  p_items jsonb,                   -- [{product_id, quantity, note}]
  p_payment_method text,           -- 'pix' | 'cash' | 'card'
  p_change_for numeric,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
  v_open boolean;
  v_customer_id uuid;
  v_order_id uuid;
  v_token uuid := gen_random_uuid();
  v_total numeric := 0;
  v_delivery_fee numeric := 0;
  v_neighborhood text;
  v_fee_info jsonb;
  v_table_name text;
  v_max_custom_price constant numeric := 9999.99;
  v_auto_approve boolean := true;
  v_should_print boolean := true;
  v_print_status text;
  v_eta timestamptz;
  v_prep_min int;
  v_buffer_min int;
  v_idem_hash text;
  v_existing_id uuid;
  v_existing_token uuid;
  v_existing_eta timestamptz;
BEGIN
  -- Restaurante
  SELECT id, default_prep_minutes, delivery_prep_buffer
    INTO v_restaurant_id, v_prep_min, v_buffer_min
  FROM public.restaurants WHERE slug = p_restaurant_slug;
  IF v_restaurant_id IS NULL THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;

  -- Loja aberta?
  v_open := public.is_restaurant_open(v_restaurant_id);
  IF NOT v_open THEN RAISE EXCEPTION 'restaurant_closed'; END IF;

  -- Validações básicas
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'items_required'; END IF;
  IF jsonb_array_length(p_items) > 200 THEN RAISE EXCEPTION 'too_many_items'; END IF;
  IF p_service_type NOT IN ('delivery','takeout','dine_in') THEN RAISE EXCEPTION 'invalid_service_type'; END IF;
  IF p_service_type = 'delivery' AND (p_address IS NULL OR (p_address->>'street') IS NULL) THEN
    RAISE EXCEPTION 'address_required';
  END IF;

  -- Cliente
  v_customer_id := public.get_or_create_customer(p_customer_phone, p_customer_name);

  -- Idempotência: hash(customer + items + janela 15min)
  v_idem_hash := md5(v_customer_id::text || ':' || p_items::text || ':' ||
                     to_char(date_trunc('minute', now()) - (extract(minute from now())::int % 15) * interval '1 minute',
                             'YYYY-MM-DD"T"HH24:MI'));

  SELECT id, public_token, estimated_ready_at
    INTO v_existing_id, v_existing_token, v_existing_eta
  FROM public.orders
  WHERE channel = 'online'
    AND customer_id = v_customer_id
    AND created_at > now() - interval '15 minutes'
    AND md5(coalesce(delta_items::text,'') || p_items::text) IS NOT NULL
    AND status IN ('new','preparing','done')
  ORDER BY created_at DESC LIMIT 1;

  -- (idempotência simples por cliente+15min — se quiser bloquear duplicado, descomente:)
  -- IF v_existing_id IS NOT NULL THEN
  --   RETURN jsonb_build_object('order_id', v_existing_id, 'public_token', v_existing_token,
  --                             'estimated_ready_at', v_existing_eta, 'idempotent', true);
  -- END IF;

  -- Taxa de entrega
  IF p_service_type = 'delivery' THEN
    v_neighborhood := p_address->>'neighborhood';
    v_fee_info := public.calculate_delivery_fee(v_restaurant_id, v_neighborhood);
    v_delivery_fee := COALESCE((v_fee_info->>'fee')::numeric, 0);
  END IF;

  -- Auto-approve setting
  SELECT (value = 'true') INTO v_auto_approve
  FROM public.settings WHERE key = 'auto_approve_online_orders';
  IF v_auto_approve IS NULL THEN v_auto_approve := true; END IF;

  v_should_print := v_auto_approve;
  v_print_status := CASE WHEN v_should_print THEN 'pending' ELSE 'printed' END;

  -- table_name "virtual" para pedido online
  v_table_name := CASE p_service_type
    WHEN 'delivery' THEN 'ENTREGA #' || substr(v_token::text, 1, 4)
    WHEN 'takeout'  THEN 'RETIRADA #' || substr(v_token::text, 1, 4)
    ELSE 'ONLINE #' || substr(v_token::text, 1, 4)
  END;

  v_eta := now() + make_interval(mins => v_prep_min + CASE WHEN p_service_type='delivery' THEN v_buffer_min ELSE 0 END);

  -- Cria order
  INSERT INTO public.orders (
    table_name, original_table_name, waiter_name, total, status, print_status, version,
    channel, service_type, customer_id, customer_name_snapshot, customer_phone_snapshot,
    delivery_address, delivery_fee, payment_method, change_for,
    approved_at, approved_by, estimated_ready_at, public_token
  ) VALUES (
    v_table_name, v_table_name, NULL, 0, 'new', v_print_status, 1,
    'online', p_service_type, v_customer_id, NULLIF(trim(p_customer_name),''),
    regexp_replace(coalesce(p_customer_phone,''),'\D','','g'),
    p_address, v_delivery_fee, p_payment_method, p_change_for,
    CASE WHEN v_auto_approve THEN now() ELSE NULL END,
    CASE WHEN v_auto_approve THEN 'auto' ELSE NULL END,
    v_eta, v_token
  ) RETURNING id INTO v_order_id;

  -- Itens (preço autoritativo do banco)
  WITH inserted AS (
    INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal)
    SELECT
      v_order_id,
      (item->>'product_id')::uuid,
      p.name,
      p.price,
      LEAST(GREATEST(COALESCE((item->>'quantity')::int, 1), 1), 99),
      NULLIF(item->>'note',''),
      p.price * LEAST(GREATEST(COALESCE((item->>'quantity')::int, 1), 1), 99)
    FROM jsonb_array_elements(p_items) AS item
    JOIN public.products p ON p.id = (item->>'product_id')::uuid
    WHERE p.active = true AND p.is_available_online = true
    RETURNING subtotal
  )
  SELECT COALESCE(SUM(subtotal),0) INTO v_total FROM inserted;

  IF v_total = 0 THEN
    DELETE FROM public.orders WHERE id = v_order_id;
    RAISE EXCEPTION 'no_valid_items';
  END IF;

  UPDATE public.orders
  SET total = v_total + v_delivery_fee
  WHERE id = v_order_id;

  -- Atualiza customer
  UPDATE public.customers
  SET total_orders = total_orders + 1,
      last_order_at = now(),
      updated_at = now()
  WHERE id = v_customer_id;

  -- Histórico
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'new', 'public_checkout',
          CASE WHEN v_auto_approve THEN 'auto-approved' ELSE 'awaiting approval' END);

  -- Print job (mesmo fluxo do .exe atual)
  IF v_should_print THEN
    PERFORM public.enqueue_print_job(v_order_id, 'order',
      jsonb_build_object('source','online','service_type', p_service_type));
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'public_token', v_token,
    'estimated_ready_at', v_eta,
    'total', v_total + v_delivery_fee,
    'delivery_fee', v_delivery_fee,
    'auto_approved', v_auto_approve
  );
END;
$$;

-- ---------- 8) RPCs de aprovação (modo manual futuro) ----------

CREATE OR REPLACE FUNCTION public.approve_online_order(p_order_id uuid, p_approver text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_already timestamptz; v_channel text;
BEGIN
  SELECT approved_at, channel INTO v_already, v_channel FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_channel IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_channel <> 'online' THEN RAISE EXCEPTION 'not_online_order'; END IF;
  IF v_already IS NOT NULL THEN RETURN; END IF; -- idempotente

  UPDATE public.orders
  SET approved_at = now(),
      approved_by = COALESCE(NULLIF(trim(p_approver),''), 'admin'),
      print_status = 'pending',
      print_claimed_at = NULL,
      print_last_error = NULL
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
  VALUES (p_order_id, 'new', 'new', p_approver, 'manual_approved');

  PERFORM public.enqueue_print_job(p_order_id, 'order', jsonb_build_object('source','online','manual_approve', true));
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_online_order(p_order_id uuid, p_reason text, p_approver text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_channel text;
BEGIN
  SELECT channel INTO v_channel FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_channel IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_channel <> 'online' THEN RAISE EXCEPTION 'not_online_order'; END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      rejected_reason = NULLIF(trim(p_reason),''),
      approved_by = NULLIF(trim(p_approver),''),
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
  VALUES (p_order_id, 'new', 'cancelled', p_approver, p_reason);
END;
$$;

-- ---------- 9) RPC pública de tracking ----------

CREATE OR REPLACE FUNCTION public.get_public_order_status(p_order_id uuid, p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row record;
BEGIN
  SELECT id, status, total, delivery_fee, service_type, customer_name_snapshot,
         estimated_ready_at, created_at, approved_at, rejected_reason, table_name
  INTO v_row
  FROM public.orders WHERE id = p_order_id AND public_token = p_token;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'service_type', v_row.service_type,
    'customer_name', v_row.customer_name_snapshot,
    'total', v_row.total,
    'delivery_fee', v_row.delivery_fee,
    'estimated_ready_at', v_row.estimated_ready_at,
    'created_at', v_row.created_at,
    'approved_at', v_row.approved_at,
    'rejected_reason', v_row.rejected_reason,
    'short_code', v_row.table_name
  );
END;
$$;

-- ---------- 10) Settings padrão ----------
INSERT INTO public.settings (key, value)
VALUES ('auto_approve_online_orders','true')
ON CONFLICT (key) DO NOTHING;

-- ---------- 11) Seed restaurante + horários + categorias ----------
INSERT INTO public.restaurants (slug, name, default_prep_minutes, delivery_prep_buffer, is_open_override)
VALUES ('plano-b-espetaria', 'Plano B Espetaria', 25, 10, 'auto')
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE v_rid uuid;
BEGIN
  SELECT id INTO v_rid FROM public.restaurants WHERE slug='plano-b-espetaria';

  -- horários (0=Dom ... 6=Sáb) — apenas se vazio
  IF NOT EXISTS (SELECT 1 FROM public.business_hours WHERE restaurant_id = v_rid) THEN
    INSERT INTO public.business_hours (restaurant_id, weekday, opens_at, closes_at, is_closed) VALUES
      (v_rid, 0, NULL, NULL, true),
      (v_rid, 1, '17:00', '22:10', false),
      (v_rid, 2, '17:00', '22:00', false),
      (v_rid, 3, '08:00', '23:00', false),
      (v_rid, 4, '08:00', '22:00', false),
      (v_rid, 5, '17:00', '23:00', false),
      (v_rid, 6, '11:00', '23:00', false);
  END IF;

  -- categorias
  INSERT INTO public.menu_categories (restaurant_id, slug, name, display_order, active) VALUES
    (v_rid, 'refeicoes', 'Refeições', 1, true),
    (v_rid, 'espetos',   'Espetos',   2, true),
    (v_rid, 'bebidas',   'Bebidas',   3, true),
    (v_rid, 'cervejas',  'Cervejas',  4, true)
  ON CONFLICT (restaurant_id, slug) DO NOTHING;
END $$;
