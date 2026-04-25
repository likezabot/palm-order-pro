-- ============================================================
-- 1) create_public_order: taxa fixa R$5 em delivery (ignora zonas)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_public_order(
  p_restaurant_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_service_type text,
  p_payment_method text,
  p_change_for numeric,
  p_address jsonb,
  p_items jsonb,
  p_note text,
  p_client_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_prep_min int;
  v_buffer_min int;
  v_token uuid := gen_random_uuid();
  v_order_id uuid;
  v_customer_id uuid;
  v_items_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_total numeric := 0;
  v_normalized_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_pid uuid;
  v_qty int;
  v_pname text;
  v_pprice numeric;
  v_eta timestamptz;
  v_table_name text;
  v_auto_approve boolean;
  v_existing_order record;
BEGIN
  -- Idempotência
  IF p_client_request_id IS NOT NULL AND length(p_client_request_id) > 0 THEN
    SELECT id, public_token, status, total, estimated_ready_at
      INTO v_existing_order
    FROM public.orders
    WHERE channel = 'online'
      AND (delta_items->>'client_request_id') = p_client_request_id
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_existing_order.id,
        'public_token', v_existing_order.public_token,
        'status', v_existing_order.status,
        'auto_approved', v_existing_order.status <> 'pending_approval',
        'estimated_ready_at', v_existing_order.estimated_ready_at,
        'total', v_existing_order.total,
        'idempotent', true
      );
    END IF;
  END IF;

  -- Restaurante
  SELECT id, default_prep_minutes, delivery_prep_buffer
    INTO v_restaurant_id, v_prep_min, v_buffer_min
  FROM public.restaurants WHERE slug = p_restaurant_slug;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_not_found';
  END IF;

  -- Aberto?
  IF NOT public.is_restaurant_open(v_restaurant_id) THEN
    RAISE EXCEPTION 'restaurant_closed';
  END IF;

  -- Validações básicas
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
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

  -- Delivery: validar endereço + TAXA FIXA R$ 5,00 (zonas ignoradas)
  IF p_service_type = 'delivery' THEN
    IF p_address IS NULL OR coalesce(p_address->>'neighborhood','') = '' THEN
      RAISE EXCEPTION 'invalid_address';
    END IF;
    v_delivery_fee := 5.00;
  END IF;

  -- Itens (preço/nome SEMPRE do banco)
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
    WHERE id = v_pid AND active = true
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
  v_customer_id := public.get_or_create_customer(p_customer_phone, p_customer_name);

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

  INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, subtotal, note)
  SELECT v_order_id,
         (it->>'product_id')::uuid,
         it->>'product_name',
         (it->>'product_price')::numeric,
         (it->>'quantity')::int,
         (it->>'product_price')::numeric * (it->>'quantity')::int,
         it->>'note'
  FROM jsonb_array_elements(v_normalized_items) AS it;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'new', 'public_checkout', 'Pedido criado pelo cardápio público');

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

-- ============================================================
-- 2) admin_edit_online_order_item: editar qtd ou remover item
--    de pedidos do canal 'online'. Recalcula total = subtotal + delivery_fee.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_edit_online_order_item(
  p_order_id uuid,
  p_item_id uuid,
  p_new_quantity int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_channel text;
  v_status text;
  v_delivery_fee numeric;
  v_new_subtotal numeric := 0;
  v_new_total numeric := 0;
  v_item record;
BEGIN
  SELECT channel, status, delivery_fee
    INTO v_channel, v_status, v_delivery_fee
  FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_channel <> 'online' THEN RAISE EXCEPTION 'not_online_order'; END IF;
  IF v_status IN ('paid','cancelled') THEN RAISE EXCEPTION 'order_finalized'; END IF;
  IF p_new_quantity < 0 OR p_new_quantity > 999 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  SELECT id, product_price INTO v_item
  FROM public.order_items
  WHERE id = p_item_id AND order_id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;

  IF p_new_quantity = 0 THEN
    DELETE FROM public.order_items WHERE id = p_item_id;
  ELSE
    UPDATE public.order_items
    SET quantity = p_new_quantity,
        subtotal = product_price * p_new_quantity
    WHERE id = p_item_id;
  END IF;

  SELECT coalesce(sum(subtotal), 0) INTO v_new_subtotal
  FROM public.order_items WHERE order_id = p_order_id;
  v_new_total := v_new_subtotal + coalesce(v_delivery_fee, 0);

  UPDATE public.orders
  SET total = v_new_total,
      version = coalesce(version,1) + 1,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
  VALUES (p_order_id, v_status, v_status, 'admin', 'Item editado: qty=' || p_new_quantity);

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'subtotal', v_new_subtotal,
    'delivery_fee', coalesce(v_delivery_fee, 0),
    'total', v_new_total
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_edit_online_order_item(uuid, uuid, int) TO anon, authenticated;