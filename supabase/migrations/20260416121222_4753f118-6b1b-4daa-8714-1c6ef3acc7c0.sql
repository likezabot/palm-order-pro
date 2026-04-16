-- Update create_order to support p_should_print
CREATE OR REPLACE FUNCTION public.create_order(
  p_table_name text,
  p_waiter_name text,
  p_total numeric,
  p_items jsonb,
  p_should_print boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id uuid;
  v_order record;
  v_print_status text;
BEGIN
  IF p_table_name IS NULL OR p_table_name = '' THEN
    RAISE EXCEPTION 'table_name is required';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items are required';
  END IF;

  v_print_status := CASE WHEN p_should_print THEN 'pending' ELSE 'printed' END;

  INSERT INTO public.orders (table_name, waiter_name, total, status, print_status, version)
  VALUES (p_table_name, NULLIF(p_waiter_name, ''), p_total, 'new', v_print_status, 1)
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

-- Update update_order_items to support p_should_print
CREATE OR REPLACE FUNCTION public.update_order_items(
  p_order_id uuid, 
  p_total numeric, 
  p_items jsonb, 
  p_delta_items jsonb DEFAULT NULL, 
  p_print_type text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL,
  p_should_print boolean DEFAULT true
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
  v_print_status text;
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
  v_print_status := CASE WHEN p_should_print THEN 'pending' ELSE 'printed' END;

  UPDATE public.orders
  SET total = p_total,
      updated_at = now(),
      print_status = v_print_status,
      printed_at = CASE WHEN p_should_print THEN NULL ELSE now() END,
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

-- Update pay_order to support p_should_print
CREATE OR REPLACE FUNCTION public.pay_order(
  p_order_id uuid,
  p_payment_method text,
  p_amount_paid numeric,
  p_should_print boolean DEFAULT false
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
      updated_at = now(),
      print_status = CASE WHEN p_should_print THEN 'pending' ELSE print_status END,
      print_type = CASE WHEN p_should_print THEN 'bill' ELSE print_type END,
      printed_at = CASE WHEN p_should_print THEN NULL ELSE printed_at END
  WHERE id = p_order_id;
END;
$$;