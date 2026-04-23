-- =========================================================================
-- AUDITORIA DE SEGURANÇA - CICLO 2
-- Hardening de RPCs, RLS e migração de PIN para hash
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------------------------
-- 1) PIN: migrar de texto plano para hash bcrypt
-- -------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_hash text;

-- Faz hash dos PINs existentes (apenas onde ainda há texto)
UPDATE public.profiles
SET pin_hash = crypt(pin, gen_salt('bf', 10))
WHERE pin IS NOT NULL AND pin <> '' AND pin_hash IS NULL;

-- Dropa coluna em texto plano
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pin;

-- Revoga acesso da coluna pin_hash do anon/authenticated (só service_role lê)
REVOKE SELECT (pin_hash) ON public.profiles FROM anon, authenticated, public;

-- -------------------------------------------------------------------------
-- 2) Tabela de rate-limit para verify_manager_pin
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pin_attempt_log (
  id bigserial PRIMARY KEY,
  client_fingerprint text NOT NULL,
  success boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pin_attempt_recent
  ON public.pin_attempt_log (client_fingerprint, attempted_at DESC);

ALTER TABLE public.pin_attempt_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pin_attempt_log_no_access ON public.pin_attempt_log;
CREATE POLICY pin_attempt_log_no_access ON public.pin_attempt_log
  FOR ALL TO public USING (false) WITH CHECK (false);

-- -------------------------------------------------------------------------
-- 3) verify_manager_pin: SECURITY DEFINER + rate limit
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_manager_pin(p_pin text, p_fingerprint text DEFAULT 'unknown')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_failures int;
  v_match boolean := false;
BEGIN
  IF p_pin IS NULL OR length(p_pin) < 4 THEN RETURN false; END IF;

  SELECT count(*) INTO v_recent_failures
  FROM public.pin_attempt_log
  WHERE client_fingerprint = p_fingerprint
    AND success = false
    AND attempted_at > now() - interval '15 minutes';

  IF v_recent_failures >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING HINT = 'Too many failed PIN attempts. Wait 15 minutes.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE role IN ('manager','owner','admin')
      AND pin_hash IS NOT NULL
      AND pin_hash = crypt(p_pin, pin_hash)
  ) INTO v_match;

  INSERT INTO public.pin_attempt_log (client_fingerprint, success)
  VALUES (p_fingerprint, v_match);

  RETURN v_match;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_manager_pin(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_manager_pin(text, text) TO anon, authenticated;

-- Helper interno: assert PIN OK ou aborta
CREATE OR REPLACE FUNCTION public._require_manager_pin(p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE role IN ('manager','owner','admin')
      AND pin_hash IS NOT NULL
      AND pin_hash = crypt(coalesce(p_pin,''), pin_hash)
  ) THEN
    RAISE EXCEPTION 'invalid_manager_pin';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._require_manager_pin(text) FROM public;

-- -------------------------------------------------------------------------
-- 4) pay_order: recálculo + validação + lock
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_order(
  p_order_id uuid,
  p_payment_method text,
  p_amount_paid numeric,
  p_should_print boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_real_total numeric;
  v_method text;
BEGIN
  v_method := lower(coalesce(p_payment_method, ''));
  IF v_method NOT IN ('cash','pix','card','credit','debit','none') THEN
    RAISE EXCEPTION 'invalid_payment_method: %', p_payment_method;
  END IF;
  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
    RAISE EXCEPTION 'invalid_amount_paid';
  END IF;

  -- Lock da linha do pedido (anti race + double-pay)
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_status = 'paid' THEN RAISE EXCEPTION 'order_already_paid'; END IF;

  -- Recalcula total real a partir dos itens (NUNCA confia em orders.total)
  SELECT COALESCE(SUM(subtotal), 0) INTO v_real_total
  FROM public.order_items WHERE order_id = p_order_id;

  IF v_real_total <= 0 THEN
    RAISE EXCEPTION 'order_has_no_items';
  END IF;

  -- Validação de valor pago
  IF v_method = 'cash' THEN
    IF p_amount_paid + 0.01 < v_real_total THEN
      RAISE EXCEPTION 'insufficient_cash: required % got %', v_real_total, p_amount_paid;
    END IF;
  ELSIF v_method = 'none' THEN
    -- 'none' = fechamento administrativo (cortesia/cancelamento contábil); aceita qualquer valor
    NULL;
  ELSE
    -- pix/card/credit/debit: valor exato (tolerância 1 centavo)
    IF abs(v_real_total - p_amount_paid) > 0.01 THEN
      RAISE EXCEPTION 'amount_mismatch: required % got %', v_real_total, p_amount_paid;
    END IF;
  END IF;

  UPDATE public.orders
  SET status = 'paid',
      payment_method = v_method,
      amount_paid = p_amount_paid,
      total = v_real_total,
      updated_at = now(),
      print_status = CASE WHEN p_should_print THEN 'pending' ELSE print_status END,
      print_type = CASE WHEN p_should_print THEN 'bill' ELSE print_type END,
      printed_at = CASE WHEN p_should_print THEN NULL ELSE printed_at END
  WHERE id = p_order_id;
END;
$$;

-- -------------------------------------------------------------------------
-- 5) create_order: recálculo de subtotal/total a partir de products.price
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
  p_table_name text,
  p_waiter_name text,
  p_total numeric,
  p_items jsonb,
  p_should_print boolean DEFAULT true,
  p_original_table_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order record;
  v_print_status text;
  v_existing_id uuid;
  v_existing_name text;
  v_original text;
  v_real_total numeric := 0;
  v_max_custom_price constant numeric := 9999.99;
BEGIN
  IF p_table_name IS NULL OR p_table_name = '' THEN RAISE EXCEPTION 'table_name is required'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'items are required'; END IF;
  IF jsonb_array_length(p_items) > 200 THEN RAISE EXCEPTION 'too_many_items'; END IF;

  v_original := COALESCE(NULLIF(trim(p_original_table_name), ''), p_table_name);

  IF v_original <> 'BALCÃO' THEN
    SELECT id, table_name INTO v_existing_id, v_existing_name
    FROM public.orders
    WHERE status IN ('new','preparing','done')
      AND (original_table_name = v_original
           OR (original_table_name IS NULL AND table_name = v_original))
    ORDER BY created_at DESC LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'table_already_in_use:%:%', v_existing_id, v_existing_name;
    END IF;
  END IF;

  v_print_status := CASE WHEN p_should_print THEN 'pending' ELSE 'printed' END;

  INSERT INTO public.orders (table_name, original_table_name, waiter_name, total, status, print_status, version)
  VALUES (p_table_name, v_original, NULLIF(p_waiter_name, ''), 0, 'new', v_print_status, 1)
  RETURNING id INTO v_order_id;

  -- Insere itens recalculando subtotal a partir do preço REAL do produto
  WITH inserted AS (
    INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal, waiter_name)
    SELECT
      v_order_id,
      CASE WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
           THEN (item->>'product_id')::uuid ELSE NULL END AS pid,
      item->>'product_name',
      -- Preço autoritativo: products.price quando product_id existe; senão o do client (com teto)
      CASE
        WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
             AND EXISTS(SELECT 1 FROM public.products WHERE id = (item->>'product_id')::uuid)
          THEN (SELECT price FROM public.products WHERE id = (item->>'product_id')::uuid)
        ELSE LEAST(GREATEST(COALESCE((item->>'product_price')::numeric, 0), 0), v_max_custom_price)
      END AS real_price,
      LEAST(GREATEST(COALESCE((item->>'quantity')::int, 1), 1), 999) AS qty,
      NULLIF(item->>'note', ''),
      -- Subtotal recalculado
      (CASE
        WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
             AND EXISTS(SELECT 1 FROM public.products WHERE id = (item->>'product_id')::uuid)
          THEN (SELECT price FROM public.products WHERE id = (item->>'product_id')::uuid)
        ELSE LEAST(GREATEST(COALESCE((item->>'product_price')::numeric, 0), 0), v_max_custom_price)
      END) * LEAST(GREATEST(COALESCE((item->>'quantity')::int, 1), 1), 999),
      COALESCE(NULLIF(item->>'waiter_name', ''), NULLIF(p_waiter_name, ''))
    FROM jsonb_array_elements(p_items) AS item
    RETURNING subtotal
  )
  SELECT COALESCE(SUM(subtotal), 0) INTO v_real_total FROM inserted;

  UPDATE public.orders SET total = v_real_total WHERE id = v_order_id;

  SELECT id, created_at INTO v_order FROM public.orders WHERE id = v_order_id;
  RETURN jsonb_build_object('id', v_order_id, 'created_at', v_order.created_at, 'total', v_real_total);
END;
$$;

-- -------------------------------------------------------------------------
-- 6) update_order_items: recálculo idem
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_order_items(
  p_order_id uuid,
  p_total numeric,
  p_items jsonb,
  p_delta_items jsonb DEFAULT NULL,
  p_print_type text DEFAULT NULL,
  p_expected_version int DEFAULT NULL,
  p_should_print boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_current_version int;
  v_new_version int;
  v_print_status text;
  v_order_waiter text;
  v_real_total numeric := 0;
  v_max_custom_price constant numeric := 9999.99;
BEGIN
  IF p_items IS NULL THEN RAISE EXCEPTION 'items are required'; END IF;
  IF jsonb_array_length(p_items) > 200 THEN RAISE EXCEPTION 'too_many_items'; END IF;

  SELECT status, version, waiter_name
  INTO v_current_status, v_current_version, v_order_waiter
  FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_current_status IS NULL THEN RAISE EXCEPTION 'order_not_found: %', p_order_id; END IF;
  IF v_current_status NOT IN ('new','preparing','done') THEN
    RAISE EXCEPTION 'order_not_editable: status is %', v_current_status;
  END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version THEN
    RAISE EXCEPTION 'version_conflict: expected % but found %', p_expected_version, v_current_version;
  END IF;

  v_new_version := v_current_version + 1;
  v_print_status := CASE WHEN p_should_print THEN 'pending' ELSE 'printed' END;

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  WITH inserted AS (
    INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal, waiter_name)
    SELECT
      p_order_id,
      CASE WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
           THEN (item->>'product_id')::uuid ELSE NULL END,
      item->>'product_name',
      CASE
        WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
             AND EXISTS(SELECT 1 FROM public.products WHERE id = (item->>'product_id')::uuid)
          THEN (SELECT price FROM public.products WHERE id = (item->>'product_id')::uuid)
        ELSE LEAST(GREATEST(COALESCE((item->>'product_price')::numeric, 0), 0), v_max_custom_price)
      END,
      LEAST(GREATEST(COALESCE((item->>'quantity')::int, 1), 1), 999),
      NULLIF(item->>'note', ''),
      (CASE
        WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
             AND EXISTS(SELECT 1 FROM public.products WHERE id = (item->>'product_id')::uuid)
          THEN (SELECT price FROM public.products WHERE id = (item->>'product_id')::uuid)
        ELSE LEAST(GREATEST(COALESCE((item->>'product_price')::numeric, 0), 0), v_max_custom_price)
      END) * LEAST(GREATEST(COALESCE((item->>'quantity')::int, 1), 1), 999),
      COALESCE(NULLIF(item->>'waiter_name', ''), v_order_waiter)
    FROM jsonb_array_elements(p_items) AS item
    RETURNING subtotal
  )
  SELECT COALESCE(SUM(subtotal),0) INTO v_real_total FROM inserted;

  UPDATE public.orders
  SET total = v_real_total,
      updated_at = now(),
      print_status = v_print_status,
      printed_at = CASE WHEN p_should_print THEN NULL ELSE now() END,
      print_claimed_at = NULL,
      print_last_error = NULL,
      delta_items = p_delta_items,
      print_type = p_print_type,
      version = v_new_version
  WHERE id = p_order_id;

  RETURN jsonb_build_object('version', v_new_version, 'total', v_real_total);
END;
$$;

-- -------------------------------------------------------------------------
-- 7) update_order_status: máquina de estados
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text;
  v_clean text;
BEGIN
  v_clean := lower(trim(coalesce(p_status,'')));
  IF v_clean NOT IN ('new','preparing','done','cancelled') THEN
    RAISE EXCEPTION 'invalid_status: %', p_status;
  END IF;

  SELECT status INTO v_current FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_current = 'paid' THEN RAISE EXCEPTION 'cannot_change_paid_order'; END IF;
  IF v_current = 'cancelled' AND v_clean <> 'cancelled' THEN
    RAISE EXCEPTION 'cannot_revive_cancelled_order';
  END IF;

  UPDATE public.orders SET status = v_clean, updated_at = now() WHERE id = p_order_id;
END;
$$;

-- -------------------------------------------------------------------------
-- 8) apply_inventory_movement: tetos
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  p_item_id uuid, p_type text, p_quantity numeric,
  p_note text DEFAULT NULL, p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current numeric;
  v_new numeric;
  v_product_id uuid;
  v_product_active boolean;
  v_item_name text;
  v_source text;
  v_max_qty constant numeric := 10000;
  v_min_stock constant numeric := -1000;
BEGIN
  IF p_type NOT IN ('in','out','adjustment') THEN
    RAISE EXCEPTION 'invalid_movement_type: %', p_type;
  END IF;
  IF p_quantity IS NULL OR p_quantity < 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF p_quantity > v_max_qty THEN RAISE EXCEPTION 'quantity_exceeds_limit: max %', v_max_qty; END IF;

  v_source := coalesce(p_source, 'manual');
  IF v_source NOT IN ('manual','telegram','pdv','system') THEN v_source := 'system'; END IF;

  SELECT current_stock, product_id, name INTO v_current, v_product_id, v_item_name
  FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;

  v_new := CASE p_type
    WHEN 'in' THEN v_current + p_quantity
    WHEN 'out' THEN v_current - p_quantity
    WHEN 'adjustment' THEN p_quantity
  END;

  IF v_new < v_min_stock THEN
    RAISE EXCEPTION 'stock_floor_exceeded: would result in %', v_new;
  END IF;

  UPDATE public.inventory_items
  SET current_stock = v_new, updated_at = now() WHERE id = p_item_id;

  INSERT INTO public.inventory_movements (item_id, movement_type, quantity, note, source)
  VALUES (p_item_id, p_type, p_quantity, NULLIF(trim(coalesce(p_note,'')),''), v_source);

  v_product_active := NULL;
  IF v_product_id IS NOT NULL THEN
    SELECT active INTO v_product_active FROM public.products WHERE id = v_product_id;
  END IF;

  RETURN jsonb_build_object(
    'new_stock', v_new, 'previous_stock', v_current, 'item_name', v_item_name,
    'linked_product_id', v_product_id, 'linked_product_active', v_product_active
  );
END;
$$;

-- -------------------------------------------------------------------------
-- 9) merge_table_duplicates: advisory lock
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_table_duplicates(p_table_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary_id uuid;
  v_duplicate_ids uuid[];
  v_merged_count int := 0;
  v_total numeric;
BEGIN
  IF p_table_name IS NULL OR trim(p_table_name) = '' THEN RAISE EXCEPTION 'table_name_required'; END IF;
  IF p_table_name = 'BALCÃO' THEN RAISE EXCEPTION 'cannot_merge_balcao'; END IF;

  -- Serializa merges concorrentes da mesma mesa
  PERFORM pg_advisory_xact_lock(hashtext('merge:' || p_table_name));

  SELECT array_agg(id ORDER BY created_at ASC) INTO v_duplicate_ids
  FROM public.orders
  WHERE status IN ('new','preparing','done')
    AND (original_table_name = p_table_name
         OR (original_table_name IS NULL AND table_name = p_table_name))
  FOR UPDATE;

  IF v_duplicate_ids IS NULL OR array_length(v_duplicate_ids, 1) < 2 THEN
    RETURN jsonb_build_object('merged', 0, 'primary_id', NULL);
  END IF;

  v_primary_id := v_duplicate_ids[1];
  v_merged_count := array_length(v_duplicate_ids, 1) - 1;

  UPDATE public.order_items
  SET order_id = v_primary_id
  WHERE order_id = ANY(v_duplicate_ids[2:array_length(v_duplicate_ids,1)]);

  WITH consolidated AS (
    SELECT MIN(id) AS keep_id, product_id, product_name, product_price,
           COALESCE(note, '') AS note_key,
           SUM(quantity) AS total_qty, SUM(subtotal) AS total_sub,
           array_agg(id) AS all_ids
    FROM public.order_items WHERE order_id = v_primary_id
    GROUP BY product_id, product_name, product_price, COALESCE(note, '')
  ),
  updated_keepers AS (
    UPDATE public.order_items oi
    SET quantity = c.total_qty, subtotal = c.total_sub
    FROM consolidated c WHERE oi.id = c.keep_id RETURNING oi.id
  )
  DELETE FROM public.order_items
  WHERE id IN (SELECT unnest(all_ids) FROM consolidated WHERE array_length(all_ids, 1) > 1)
    AND id NOT IN (SELECT id FROM updated_keepers);

  SELECT COALESCE(SUM(subtotal), 0) INTO v_total
  FROM public.order_items WHERE order_id = v_primary_id;

  UPDATE public.orders
  SET total = v_total, updated_at = now(), version = version + 1,
      print_status = 'pending', print_type = 'full',
      printed_at = NULL, print_claimed_at = NULL,
      print_last_error = NULL, delta_items = NULL
  WHERE id = v_primary_id;

  DELETE FROM public.orders
  WHERE id = ANY(v_duplicate_ids[2:array_length(v_duplicate_ids,1)]);

  RETURN jsonb_build_object('merged', v_merged_count, 'primary_id', v_primary_id, 'total', v_total);
END;
$$;

-- -------------------------------------------------------------------------
-- 10) RPCs administrativas com PIN
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_upsert_product(
  p_pin text,
  p_id uuid,
  p_name text,
  p_price numeric,
  p_category text,
  p_active boolean DEFAULT true,
  p_aliases text[] DEFAULT '{}',
  p_unit text DEFAULT 'unidade'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public._require_manager_pin(p_pin);
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_price IS NULL OR p_price < 0 OR p_price > 99999 THEN RAISE EXCEPTION 'invalid_price'; END IF;
  IF p_category IS NULL OR length(trim(p_category)) = 0 THEN RAISE EXCEPTION 'category_required'; END IF;

  IF p_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.products WHERE id = p_id) THEN
    UPDATE public.products
    SET name = trim(p_name), price = p_price, category = trim(p_category),
        active = p_active, aliases = COALESCE(p_aliases, '{}'),
        unit = COALESCE(p_unit, 'unidade')
    WHERE id = p_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.products (name, price, category, active, aliases, unit)
    VALUES (trim(p_name), p_price, trim(p_category), p_active, COALESCE(p_aliases, '{}'), COALESCE(p_unit, 'unidade'))
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_product(p_pin text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_manager_pin(p_pin);
  DELETE FROM public.products WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_setting(p_pin text, p_key text, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_manager_pin(p_pin);
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN RAISE EXCEPTION 'key_required'; END IF;
  IF length(coalesce(p_value,'')) > 50000 THEN RAISE EXCEPTION 'value_too_large'; END IF;

  INSERT INTO public.settings (key, value, updated_at)
  VALUES (trim(p_key), coalesce(p_value,''), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$$;

-- Garante UNIQUE em settings.key para o ON CONFLICT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settings_key_unique'
  ) THEN
    ALTER TABLE public.settings ADD CONSTRAINT settings_key_unique UNIQUE (key);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cash_open(p_pin text, p_initial_amount numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public._require_manager_pin(p_pin);
  IF p_initial_amount IS NULL OR p_initial_amount < 0 OR p_initial_amount > 100000 THEN
    RAISE EXCEPTION 'invalid_initial_amount';
  END IF;
  IF EXISTS(SELECT 1 FROM public.cash_register WHERE status = 'open') THEN
    RAISE EXCEPTION 'cash_already_open';
  END IF;
  INSERT INTO public.cash_register (initial_amount, status, opened_at)
  VALUES (p_initial_amount, 'open', now()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cash_close(p_pin text, p_register_id uuid, p_final_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_total_sales numeric;
BEGIN
  PERFORM public._require_manager_pin(p_pin);
  IF p_final_amount IS NULL OR p_final_amount < 0 OR p_final_amount > 1000000 THEN
    RAISE EXCEPTION 'invalid_final_amount';
  END IF;
  SELECT status INTO v_status FROM public.cash_register WHERE id = p_register_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'register_not_found'; END IF;
  IF v_status = 'closed' THEN RAISE EXCEPTION 'register_already_closed'; END IF;

  -- Recalcula total_sales a partir de orders pagas no período
  SELECT COALESCE(SUM(total), 0) INTO v_total_sales
  FROM public.orders
  WHERE status = 'paid'
    AND updated_at >= (SELECT opened_at FROM public.cash_register WHERE id = p_register_id);

  UPDATE public.cash_register
  SET status = 'closed', closed_at = now(),
      final_amount = p_final_amount, total_sales = v_total_sales
  WHERE id = p_register_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cash_movement_add(p_pin text, p_register_id uuid, p_type text, p_amount numeric, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text;
  v_clean_type text;
BEGIN
  PERFORM public._require_manager_pin(p_pin);
  v_clean_type := lower(trim(coalesce(p_type,'')));
  IF v_clean_type NOT IN ('sangria','withdrawal','out','suprimento','supply','in') THEN
    RAISE EXCEPTION 'invalid_movement_type';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  SELECT status INTO v_status FROM public.cash_register WHERE id = p_register_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'register_not_found'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'register_not_open'; END IF;

  INSERT INTO public.cash_movements (cash_register_id, type, amount, reason)
  VALUES (p_register_id, v_clean_type, p_amount, NULLIF(trim(coalesce(p_reason,'')),''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- -------------------------------------------------------------------------
-- 11) consume_undo_token: protege replay de "desfazer" do Telegram
-- -------------------------------------------------------------------------
ALTER TABLE public.telegram_undo_stack
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

CREATE OR REPLACE FUNCTION public.consume_undo_token(p_token text, p_chat_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ops jsonb; v_table_name text;
BEGIN
  UPDATE public.telegram_undo_stack
  SET consumed_at = now()
  WHERE token = p_token AND chat_id = p_chat_id AND consumed_at IS NULL
    AND created_at > now() - interval '5 minutes'
  RETURNING ops, table_name INTO v_ops, v_table_name;

  IF v_ops IS NULL THEN RAISE EXCEPTION 'undo_token_invalid_or_consumed'; END IF;
  RETURN jsonb_build_object('ops', v_ops, 'table_name', v_table_name);
END;
$$;

-- -------------------------------------------------------------------------
-- 12) RLS hardening: read-only para anon em tabelas críticas
-- -------------------------------------------------------------------------

-- ORDERS: mantém SELECT, remove INSERT/UPDATE diretos do anon
DROP POLICY IF EXISTS orders_select ON public.orders;
DROP POLICY IF EXISTS orders_insert ON public.orders;
DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_select ON public.orders FOR SELECT TO public USING (true);
-- INSERT/UPDATE bloqueados — só RPC SECURITY DEFINER

-- ORDER_ITEMS
DROP POLICY IF EXISTS order_items_select ON public.order_items;
DROP POLICY IF EXISTS order_items_insert ON public.order_items;
DROP POLICY IF EXISTS order_items_update ON public.order_items;
DROP POLICY IF EXISTS order_items_delete ON public.order_items;
CREATE POLICY order_items_select ON public.order_items FOR SELECT TO public USING (true);

-- PRODUCTS
DROP POLICY IF EXISTS products_select ON public.products;
DROP POLICY IF EXISTS products_insert ON public.products;
DROP POLICY IF EXISTS products_update ON public.products;
DROP POLICY IF EXISTS products_delete ON public.products;
CREATE POLICY products_select ON public.products FOR SELECT TO public USING (true);

-- CASH_REGISTER
DROP POLICY IF EXISTS "Cash register viewable by everyone" ON public.cash_register;
DROP POLICY IF EXISTS "Cash register manageable by everyone" ON public.cash_register;
CREATE POLICY cash_register_select ON public.cash_register FOR SELECT TO public USING (true);

-- CASH_MOVEMENTS
DROP POLICY IF EXISTS "Cash movements viewable by everyone" ON public.cash_movements;
DROP POLICY IF EXISTS "Cash movements manageable by everyone" ON public.cash_movements;
CREATE POLICY cash_movements_select ON public.cash_movements FOR SELECT TO public USING (true);

-- INVENTORY_ITEMS
DROP POLICY IF EXISTS inventory_items_select ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_insert ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_update ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_delete ON public.inventory_items;
CREATE POLICY inventory_items_select ON public.inventory_items FOR SELECT TO public USING (true);

-- INVENTORY_MOVEMENTS
DROP POLICY IF EXISTS inventory_movements_select ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_insert ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_update ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_delete ON public.inventory_movements;
CREATE POLICY inventory_movements_select ON public.inventory_movements FOR SELECT TO public USING (true);

-- SETTINGS
DROP POLICY IF EXISTS "Anyone can read settings" ON public.settings;
DROP POLICY IF EXISTS "Anyone can update settings" ON public.settings;
DROP POLICY IF EXISTS "Anyone can insert settings" ON public.settings;
CREATE POLICY settings_select ON public.settings FOR SELECT TO public USING (true);

-- PROFILES
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Only managers/owners can modify profiles" ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO public USING (true);
-- Mutação de profiles: só por service_role/admin (sem policy = bloqueado)

-- STOCK_MOVEMENTS
DROP POLICY IF EXISTS "Stock movements viewable by everyone" ON public.stock_movements;
DROP POLICY IF EXISTS "Stock movements manageable by everyone" ON public.stock_movements;
CREATE POLICY stock_movements_select ON public.stock_movements FOR SELECT TO public USING (true);

-- PRODUCT_RECIPES (admin-only via PIN no futuro; por ora SELECT público + bloqueio writes)
DROP POLICY IF EXISTS product_recipes_select ON public.product_recipes;
DROP POLICY IF EXISTS product_recipes_insert ON public.product_recipes;
DROP POLICY IF EXISTS product_recipes_update ON public.product_recipes;
DROP POLICY IF EXISTS product_recipes_delete ON public.product_recipes;
CREATE POLICY product_recipes_select ON public.product_recipes FOR SELECT TO public USING (true);

-- -------------------------------------------------------------------------
-- 13) Lockdown de RPCs administrativas perigosas
-- -------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.archive_and_purge_old_data(int) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_and_purge_old_data(int, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.force_clear_orphan_prints() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recover_stuck_prints() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.requeue_stuck_print_jobs(int) FROM public, anon, authenticated;

-- Mantidas executáveis pelo client (parte legítima do fluxo):
-- create_order, update_order_items, pay_order, update_order_status,
-- apply_inventory_movement, claim_order_print, complete_order_print,
-- fail_order_print, merge_table_duplicates, move_order_to_table,
-- rename_order_table, find_inventory_item_by_text, normalize_waiter_name
GRANT EXECUTE ON FUNCTION public.consume_undo_token(text, bigint) TO service_role;
REVOKE EXECUTE ON FUNCTION public.consume_undo_token(text, bigint) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_upsert_product(text, uuid, text, numeric, text, boolean, text[], text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_product(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_setting(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cash_open(text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cash_close(text, uuid, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cash_movement_add(text, uuid, text, numeric, text) TO anon, authenticated;