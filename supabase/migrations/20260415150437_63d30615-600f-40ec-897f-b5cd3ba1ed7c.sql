
-- 1. Add new columns to orders
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS print_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS print_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS print_last_error text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 2. Drop ALL existing permissive policies on orders
DROP POLICY IF EXISTS "Anyone can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can read orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can update orders" ON public.orders;

-- 3. Drop ALL existing permissive policies on order_items
DROP POLICY IF EXISTS "Anyone can delete order_items" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can update order_items" ON public.order_items;

-- 4. Drop existing permissive policies on products (keep read-only)
DROP POLICY IF EXISTS "Anyone can delete products" ON public.products;
DROP POLICY IF EXISTS "Anyone can insert products" ON public.products;
DROP POLICY IF EXISTS "Anyone can read products" ON public.products;
DROP POLICY IF EXISTS "Anyone can update products" ON public.products;

-- 5. New RLS: orders — read-only for anon, writes via RPCs
CREATE POLICY "orders_select" ON public.orders FOR SELECT USING (true);

-- 6. New RLS: order_items — read-only for anon, writes via RPCs  
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT USING (true);

-- 7. New RLS: products — read-only for anon
CREATE POLICY "products_select" ON public.products FOR SELECT USING (true);

-- Products write via admin RPCs (keep simple policies for admin page for now)
CREATE POLICY "products_insert" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "products_update" ON public.products FOR UPDATE USING (true);
CREATE POLICY "products_delete" ON public.products FOR DELETE USING (true);

-- 8. RPC: create_order (SECURITY DEFINER — bypasses RLS)
CREATE OR REPLACE FUNCTION public.create_order(
  p_table_name text,
  p_waiter_name text,
  p_total numeric,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id uuid;
  v_order record;
BEGIN
  IF p_table_name IS NULL OR p_table_name = '' THEN
    RAISE EXCEPTION 'table_name is required';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items are required';
  END IF;

  INSERT INTO public.orders (table_name, waiter_name, total, status, print_status, version)
  VALUES (p_table_name, NULLIF(p_waiter_name, ''), p_total, 'new', 'pending', 1)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal)
  SELECT
    v_order_id,
    CASE WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') != '' THEN (item->>'product_id')::UUID ELSE NULL END,
    item->>'product_name',
    (item->>'product_price')::NUMERIC,
    COALESCE((item->>'quantity')::INTEGER, 1),
    NULLIF(item->>'note', ''),
    (item->>'subtotal')::NUMERIC
  FROM jsonb_array_elements(p_items) AS item;

  SELECT id, created_at INTO v_order FROM public.orders WHERE id = v_order_id;
  
  RETURN jsonb_build_object('id', v_order_id, 'created_at', v_order.created_at);
END;
$$;

-- 9. Replace update_order_items with concurrency + validation
CREATE OR REPLACE FUNCTION public.update_order_items(
  p_order_id uuid, 
  p_total numeric, 
  p_items jsonb, 
  p_delta_items jsonb DEFAULT NULL, 
  p_print_type text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_status text;
  v_current_version integer;
  v_new_version integer;
BEGIN
  -- Validate order exists and get current state
  SELECT status, version INTO v_current_status, v_current_version
  FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'order_not_found: %', p_order_id;
  END IF;

  -- Only editable statuses
  IF v_current_status NOT IN ('new', 'preparing', 'done') THEN
    RAISE EXCEPTION 'order_not_editable: status is %', v_current_status;
  END IF;

  -- Concurrency check
  IF p_expected_version IS NOT NULL AND p_expected_version != v_current_version THEN
    RAISE EXCEPTION 'version_conflict: expected % but found %', p_expected_version, v_current_version;
  END IF;

  v_new_version := v_current_version + 1;

  UPDATE public.orders
  SET total = p_total,
      updated_at = now(),
      print_status = 'pending',
      printed_at = NULL,
      print_claimed_at = NULL,
      print_last_error = NULL,
      delta_items = p_delta_items,
      print_type = p_print_type,
      version = v_new_version
  WHERE id = p_order_id;

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal)
  SELECT
    p_order_id,
    CASE WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') != '' THEN (item->>'product_id')::UUID ELSE NULL END,
    item->>'product_name',
    (item->>'product_price')::NUMERIC,
    COALESCE((item->>'quantity')::INTEGER, 1),
    NULLIF(item->>'note', ''),
    (item->>'subtotal')::NUMERIC
  FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object('version', v_new_version);
END;
$$;

-- 10. RPC: claim_order_print — atomic claim for printing
CREATE OR REPLACE FUNCTION public.claim_order_print(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_claimed boolean;
BEGIN
  UPDATE public.orders
  SET print_status = 'printing',
      print_claimed_at = now(),
      print_last_error = NULL
  WHERE id = p_order_id
    AND print_status = 'pending'
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

-- 11. RPC: complete_order_print — mark as printed after real success
CREATE OR REPLACE FUNCTION public.complete_order_print(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.orders
  SET print_status = 'printed',
      printed_at = now()
  WHERE id = p_order_id
    AND print_status = 'printing';
END;
$$;

-- 12. RPC: fail_order_print — mark as failed, allow retry
CREATE OR REPLACE FUNCTION public.fail_order_print(p_order_id uuid, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.orders
  SET print_status = 'pending',
      print_claimed_at = NULL,
      print_last_error = p_error
  WHERE id = p_order_id
    AND print_status = 'printing';
END;
$$;

-- 13. RPC: pay_order — close account with validation
CREATE OR REPLACE FUNCTION public.pay_order(
  p_order_id uuid,
  p_payment_method text,
  p_amount_paid numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid';
  END IF;

  UPDATE public.orders
  SET status = 'paid',
      payment_method = p_payment_method,
      amount_paid = p_amount_paid,
      updated_at = now()
  WHERE id = p_order_id;
END;
$$;

-- 14. RPC: update_order_status — with validation
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current text;
BEGIN
  SELECT status INTO v_current FROM public.orders WHERE id = p_order_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF v_current = 'paid' THEN
    RAISE EXCEPTION 'cannot_change_paid_order';
  END IF;

  UPDATE public.orders SET status = p_status, updated_at = now() WHERE id = p_order_id;
END;
$$;

-- 15. Enable realtime for orders (ensure REPLICA IDENTITY FULL for old values)
ALTER TABLE public.orders REPLICA IDENTITY FULL;
