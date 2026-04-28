CREATE OR REPLACE FUNCTION public.create_public_order(
  p_restaurant_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_service_type text,
  p_payment_method text,
  p_change_for numeric DEFAULT NULL::numeric,
  p_address jsonb DEFAULT NULL::jsonb,
  p_items jsonb DEFAULT NULL::jsonb,
  p_note text DEFAULT NULL::text,
  p_client_request_id text DEFAULT NULL::text,
  p_loyalty_reward_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_auto_approve boolean;
  v_allow_closed boolean;
  v_existing_order record;
  v_norm_phone text;
  v_reward record;
  v_account_balance integer;
  v_actual_reward_id uuid := p_loyalty_reward_id;
  v_reward_name text;
  v_points_to_use integer := 0;
  v_table_name text;
BEGIN
  IF p_client_request_id IS NOT NULL AND length(p_client_request_id) > 0 THEN
    SELECT id, public_token, status, total, estimated_ready_at, approved_at
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
        'auto_approved', v_existing_order.approved_at IS NOT NULL,
        'estimated_ready_at', v_existing_order.estimated_ready_at,
        'total', v_existing_order.total,
        'idempotent', true
      );
    END IF;
  END IF;

  SELECT id, default_prep_minutes, delivery_prep_buffer
    INTO v_restaurant_id, v_prep_min, v_buffer_min
  FROM public.restaurants
  WHERE slug = p_restaurant_slug;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_not_found';
  END IF;

  v_allow_closed := public._setting_bool('allow_public_checkout_when_closed', false);
  IF NOT v_allow_closed AND NOT public.is_restaurant_open(v_restaurant_id) THEN
    RAISE EXCEPTION 'restaurant_closed';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  v_norm_phone := public.normalize_phone(p_customer_phone);
  IF v_norm_phone IS NULL OR length(v_norm_phone) < 10 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  IF p_service_type = 'delivery' THEN
    IF p_address IS NULL OR coalesce(p_address->>'neighborhood', '') = '' THEN
      RAISE EXCEPTION 'invalid_address';
    END IF;
    v_delivery_fee := 5.00;
  END IF;

  IF v_actual_reward_id IS NOT NULL THEN
    SELECT *
      INTO v_reward
    FROM public.loyalty_rewards
    WHERE id = v_actual_reward_id
      AND active = true;

    IF NOT FOUND THEN
      v_actual_reward_id := NULL;
    ELSE
      SELECT balance
        INTO v_account_balance
      FROM public.loyalty_accounts
      WHERE phone = v_norm_phone;

      IF v_account_balance IS NULL OR v_account_balance < v_reward.points_cost THEN
        v_actual_reward_id := NULL;
      END IF;
    END IF;

    IF v_actual_reward_id IS NOT NULL THEN
      v_reward_name := v_reward.display_name;
      v_points_to_use := v_reward.points_cost;
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_pid := (v_item->>'product_id')::uuid;
      v_qty := (v_item->>'quantity')::int;
      v_pname := v_item->>'product_name';
      v_pprice := (v_item->>'product_price')::numeric;

      IF v_qty > 0 THEN
        v_items_subtotal := v_items_subtotal + (v_pprice * v_qty);
        v_normalized_items := v_normalized_items || v_item;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid_item_data';
    END;
  END LOOP;

  v_total := v_items_subtotal + v_delivery_fee;
  v_customer_id := public.get_or_create_customer(
    v_norm_phone,
    p_customer_name,
    CASE WHEN p_address IS NULL THEN NULL ELSE NULLIF(trim(coalesce(p_address->>'street', '')), '') END,
    CASE WHEN p_address IS NULL THEN NULL ELSE NULLIF(trim(coalesce(p_address->>'number', '')), '') END,
    CASE WHEN p_address IS NULL THEN NULL ELSE NULLIF(trim(coalesce(p_address->>'neighborhood', '')), '') END,
    CASE WHEN p_address IS NULL THEN NULL ELSE NULLIF(trim(coalesce(p_address->>'complement', '')), '') END,
    CASE WHEN p_address IS NULL THEN NULL ELSE NULLIF(trim(coalesce(p_address->>'reference', '')), '') END,
    p_service_type,
    p_payment_method
  );

  v_table_name := CASE
    WHEN p_service_type = 'delivery' THEN 'DELIVERY'
    WHEN p_service_type = 'pickup' THEN 'RETIRADA'
    ELSE 'ONLINE'
  END;

  v_eta := now() + (coalesce(v_prep_min, 30) || ' minutes')::interval;
  IF p_service_type = 'delivery' THEN
    v_eta := v_eta + (coalesce(v_buffer_min, 15) || ' minutes')::interval;
  END IF;

  v_auto_approve := public._setting_bool('auto_approve_online_orders', false);

  INSERT INTO public.orders (
    restaurant_id,
    table_name,
    customer_id,
    customer_name_snapshot,
    customer_phone_snapshot,
    service_type,
    payment_method,
    status,
    delivery_fee,
    total,
    delivery_address,
    public_token,
    channel,
    estimated_ready_at,
    approved_at,
    approved_by,
    change_for,
    delta_items
  ) VALUES (
    v_restaurant_id,
    v_table_name,
    v_customer_id,
    trim(p_customer_name),
    v_norm_phone,
    p_service_type,
    p_payment_method,
    'new',
    v_delivery_fee,
    v_total,
    p_address,
    v_token,
    'online',
    v_eta,
    CASE WHEN v_auto_approve THEN now() ELSE NULL END,
    CASE WHEN v_auto_approve THEN 'auto' ELSE NULL END,
    p_change_for,
    jsonb_build_object(
      'client_request_id', p_client_request_id,
      'loyalty_reward_id', v_actual_reward_id,
      'loyalty_reward_name', v_reward_name,
      'points_used', v_points_to_use,
      'auto_approve_requested', v_auto_approve,
      'customer_note', p_note
    )
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal)
  SELECT
    v_order_id,
    (it->>'product_id')::uuid,
    (it->>'product_name'),
    (it->>'product_price')::numeric,
    (it->>'quantity')::int,
    (it->>'note'),
    ((it->>'product_price')::numeric * (it->>'quantity')::int)
  FROM jsonb_array_elements(v_normalized_items) it;

  IF v_actual_reward_id IS NOT NULL THEN
    INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
    VALUES (v_order_id, v_reward.product_id, '[BRINDE] ' || v_reward_name, 0, 1, 0);
  END IF;

  IF v_actual_reward_id IS NOT NULL AND v_points_to_use > 0 THEN
    PERFORM public.process_order_loyalty(v_order_id);
  END IF;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'public_token', v_token,
    'status', 'new',
    'auto_approved', v_auto_approve,
    'estimated_ready_at', v_eta,
    'total', v_total
  );
END;
$function$;