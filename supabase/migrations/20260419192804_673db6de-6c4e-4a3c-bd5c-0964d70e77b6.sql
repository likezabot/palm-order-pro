-- 1. Adiciona coluna waiter_name em order_items
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS waiter_name text;

-- 2. Backfill: itens antigos herdam o waiter do pedido
UPDATE public.order_items oi
SET waiter_name = o.waiter_name
FROM public.orders o
WHERE oi.order_id = o.id
  AND oi.waiter_name IS NULL
  AND o.waiter_name IS NOT NULL;

-- 3. Atualiza create_order (assinatura nova com original_table_name)
CREATE OR REPLACE FUNCTION public.create_order(
  p_table_name text,
  p_waiter_name text,
  p_total numeric,
  p_items jsonb,
  p_should_print boolean DEFAULT true,
  p_original_table_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_order record;
  v_print_status text;
  v_existing_id uuid;
  v_existing_name text;
  v_original text;
BEGIN
  IF p_table_name IS NULL OR p_table_name = '' THEN
    RAISE EXCEPTION 'table_name is required';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items are required';
  END IF;

  v_original := COALESCE(NULLIF(trim(p_original_table_name), ''), p_table_name);

  IF v_original <> 'BALCÃO' THEN
    SELECT id, table_name INTO v_existing_id, v_existing_name
    FROM public.orders
    WHERE status IN ('new','preparing','done')
      AND (
        original_table_name = v_original
        OR (original_table_name IS NULL AND table_name = v_original)
      )
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'table_already_in_use:%:%', v_existing_id, v_existing_name;
    END IF;
  END IF;

  v_print_status := CASE WHEN p_should_print THEN 'pending' ELSE 'printed' END;

  INSERT INTO public.orders (table_name, original_table_name, waiter_name, total, status, print_status, version)
  VALUES (p_table_name, v_original, NULLIF(p_waiter_name, ''), p_total, 'new', v_print_status, 1)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal, waiter_name)
  SELECT
    v_order_id,
    CASE WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') != '' THEN (item->>'product_id')::UUID ELSE NULL END,
    item->>'product_name',
    (item->>'product_price')::NUMERIC,
    COALESCE((item->>'quantity')::INTEGER, 1),
    NULLIF(item->>'note', ''),
    (item->>'subtotal')::NUMERIC,
    COALESCE(NULLIF(item->>'waiter_name', ''), NULLIF(p_waiter_name, ''))
  FROM jsonb_array_elements(p_items) AS item;

  SELECT id, created_at INTO v_order FROM public.orders WHERE id = v_order_id;
  RETURN jsonb_build_object('id', v_order_id, 'created_at', v_order.created_at);
END;
$function$;

-- 4. Remove a versão antiga sem original_table_name (evita ambiguidade)
DROP FUNCTION IF EXISTS public.create_order(text, text, numeric, jsonb, boolean);

-- 5. Atualiza update_order_items para gravar waiter por item
CREATE OR REPLACE FUNCTION public.update_order_items(
  p_order_id uuid,
  p_total numeric,
  p_items jsonb,
  p_delta_items jsonb DEFAULT NULL::jsonb,
  p_print_type text DEFAULT NULL::text,
  p_expected_version integer DEFAULT NULL::integer,
  p_should_print boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status text;
  v_current_version integer;
  v_new_version integer;
  v_print_status text;
  v_order_waiter text;
BEGIN
  SELECT status, version, waiter_name
  INTO v_current_status, v_current_version, v_order_waiter
  FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'order_not_found: %', p_order_id;
  END IF;

  IF v_current_status NOT IN ('new', 'preparing', 'done') THEN
    RAISE EXCEPTION 'order_not_editable: status is %', v_current_status;
  END IF;

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

  INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal, waiter_name)
  SELECT
    p_order_id,
    CASE WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') != '' THEN (item->>'product_id')::UUID ELSE NULL END,
    item->>'product_name',
    (item->>'product_price')::NUMERIC,
    COALESCE((item->>'quantity')::INTEGER, 1),
    NULLIF(item->>'note', ''),
    (item->>'subtotal')::NUMERIC,
    COALESCE(NULLIF(item->>'waiter_name', ''), v_order_waiter)
  FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object('version', v_new_version);
END;
$function$;