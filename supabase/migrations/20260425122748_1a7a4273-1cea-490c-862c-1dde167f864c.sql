-- Drop both overloads to recreate cleanly
DROP FUNCTION IF EXISTS public.create_public_order(text, text, text, text, jsonb, jsonb, text, numeric, text);
DROP FUNCTION IF EXISTS public.create_public_order(text, text, text, text, jsonb, jsonb, text, numeric, text, text);

CREATE OR REPLACE FUNCTION public.create_public_order(
  p_restaurant_slug text,
  p_service_type text,
  p_customer_phone text,
  p_customer_name text,
  p_address jsonb,
  p_items jsonb,
  p_payment_method text,
  p_change_for numeric,
  p_note text,
  p_client_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_open boolean;
  v_customer_id uuid;
  v_order_id uuid;
  v_token uuid := gen_random_uuid();
  v_total numeric := 0;
  v_items_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_neighborhood text;
  v_fee_info jsonb;
  v_table_name text;
  v_auto_approve boolean := true;
  v_eta timestamptz;
  v_prep_min int;
  v_buffer_min int;
  v_existing_id uuid;
  v_existing_token uuid;
  v_existing_eta timestamptz;
  v_existing_status text;
  v_existing_total numeric;
  v_item jsonb;
  v_pid uuid;
  v_qty int;
  v_pname text;
  v_pprice numeric;
  v_normalized_items jsonb := '[]'::jsonb;
BEGIN
  -- Restaurante
  SELECT id, default_prep_minutes, delivery_prep_buffer
    INTO v_restaurant_id, v_prep_min, v_buffer_min
  FROM public.restaurants WHERE slug = p_restaurant_slug;
  IF v_restaurant_id IS NULL THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;

  -- Idempotência: se já existe pedido com esse client_request_id, devolve-o
  IF p_client_request_id IS NOT NULL AND length(p_client_request_id) > 0 THEN
    SELECT id, public_token, estimated_ready_at, status, total
      INTO v_existing_id, v_existing_token, v_existing_eta, v_existing_status, v_existing_total
    FROM public.orders
    WHERE channel = 'online'
      AND delta_items ? 'client_request_id'
      AND delta_items->>'client_request_id' = p_client_request_id
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'id', v_existing_id,
        'public_token', v_existing_token,
        'status', v_existing_status,
        'auto_approved', true,
        'estimated_ready_at', v_existing_eta,
        'total', v_existing_total,
        'idempotent', true
      );
    END IF;
  END IF;

  -- Loja aberta?
  v_open := public.is_restaurant_open(v_restaurant_id);
  IF NOT v_open THEN RAISE EXCEPTION 'restaurant_closed'; END IF;

  -- Validar payload mínimo
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;
  IF p_customer_phone IS NULL OR length(regexp_replace(p_customer_phone, '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF p_service_type NOT IN ('delivery','pickup','dine_in') THEN
    RAISE EXCEPTION 'invalid_service_type';
  END IF;

  -- Delivery: validar endereço + taxa
  IF p_service_type = 'delivery' THEN
    IF p_address IS NULL OR coalesce(p_address->>'neighborhood','') = '' THEN
      RAISE EXCEPTION 'invalid_address';
    END IF;
    v_neighborhood := p_address->>'neighborhood';
    v_fee_info := public.calculate_delivery_fee(v_restaurant_id, v_neighborhood);
    IF v_fee_info IS NULL OR (v_fee_info->>'matched')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'neighborhood_not_served';
    END IF;
    v_delivery_fee := coalesce((v_fee_info->>'fee')::numeric, 0);
  END IF;

  -- Validar e normalizar itens (preço/nome SEMPRE do banco)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_pid := nullif(v_item->>'product_id','')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_product_id';
    END;
    IF v_pid IS NULL THEN RAISE EXCEPTION 'invalid_product_id'; END IF;

    v_qty := coalesce((v_item->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 999 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

    SELECT name, price INTO v_pname, v_pprice
    FROM public.products
    WHERE id = v_pid
      AND active = true
      AND is_available_online = true
      AND is_sold_out = false;

    IF v_pname IS NULL THEN
      RAISE EXCEPTION 'product_unavailable: %', v_pid;
    END IF;

    v_items_subtotal := v_items_subtotal + (v_pprice * v_qty);
    v_normalized_items := v_normalized_items || jsonb_build_object(
      'product_id', v_pid,
      'product_name', v_pname,
      'product_price', v_pprice,
      'quantity', v_qty,
      'note', nullif(v_item->>'note','')
    );
  END LOOP;

  v_total := v_items_subtotal + v_delivery_fee;

  -- Cliente
  v_customer_id := public.get_or_create_customer(p_customer_phone, p_customer_name);

  -- Auto-approve flag
  SELECT (value = 'true') INTO v_auto_approve
  FROM public.settings WHERE key = 'auto_approve_online_orders';
  v_auto_approve := coalesce(v_auto_approve, true);

  v_eta := now() + make_interval(mins => coalesce(v_prep_min, 25)
              + CASE WHEN p_service_type = 'delivery' THEN coalesce(v_buffer_min, 10) ELSE 0 END);

  v_table_name := CASE p_service_type
    WHEN 'delivery' THEN 'Delivery #' || substr(v_token::text, 1, 6)
    WHEN 'pickup'   THEN 'Retirada #' || substr(v_token::text, 1, 6)
    ELSE 'Online #' || substr(v_token::text, 1, 6)
  END;

  -- Criar pedido (status sempre 'new' enquanto auto-approve está ligado)
  INSERT INTO public.orders (
    table_name, channel, status, service_type,
    customer_id, customer_name_snapshot, customer_phone_snapshot,
    delivery_address, delivery_fee, payment_method, change_for,
    public_token, total, estimated_ready_at,
    approved_at, approved_by, delta_items
  ) VALUES (
    v_table_name, 'online', 'new', p_service_type,
    v_customer_id, p_customer_name, p_customer_phone,
    CASE WHEN p_service_type='delivery' THEN p_address ELSE NULL END,
    v_delivery_fee, p_payment_method, p_change_for,
    v_token, v_total, v_eta,
    CASE WHEN v_auto_approve THEN now() ELSE NULL END,
    CASE WHEN v_auto_approve THEN 'auto' ELSE NULL END,
    jsonb_build_object(
      'client_request_id', p_client_request_id,
      'note', p_note
    )
  ) RETURNING id INTO v_order_id;

  -- Itens (somente os normalizados)
  INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, subtotal, note)
  SELECT v_order_id,
         (it->>'product_id')::uuid,
         it->>'product_name',
         (it->>'product_price')::numeric,
         (it->>'quantity')::int,
         (it->>'product_price')::numeric * (it->>'quantity')::int,
         it->>'note'
  FROM jsonb_array_elements(v_normalized_items) AS it;

  -- Histórico
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'new', 'public_checkout', 'Pedido criado pelo cardápio público');

  -- Imprimir via fila oficial (somente se auto-approve)
  IF v_auto_approve THEN
    PERFORM public.enqueue_print_job(
      v_order_id,
      'order',
      jsonb_build_object('source', 'public_checkout', 'service_type', p_service_type)
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'public_token', v_token,
    'status', 'new',
    'auto_approved', v_auto_approve,
    'estimated_ready_at', v_eta,
    'total', v_total,
    'idempotent', false
  );
END;
$function$;