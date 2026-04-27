-- =============================================================
-- 1) Atualiza create_public_order para persistir endereço
--    do cliente em customer_addresses (delivery only).
-- =============================================================
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
  p_client_request_id text,
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
  v_table_name text;
  v_auto_approve boolean;
  v_existing_order record;
  v_loyalty_enabled boolean;
  v_norm_phone text;
  v_reward record;
  v_account_balance integer;
  v_addr_street text;
  v_addr_number text;
  v_addr_neigh text;
  v_addr_complement text;
  v_addr_reference text;
  v_existing_addr_id uuid;
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

  SELECT id, default_prep_minutes, delivery_prep_buffer
    INTO v_restaurant_id, v_prep_min, v_buffer_min
  FROM public.restaurants WHERE slug = p_restaurant_slug;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_not_found';
  END IF;

  IF NOT public.is_restaurant_open(v_restaurant_id) THEN
    RAISE EXCEPTION 'restaurant_closed';
  END IF;

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

  IF p_loyalty_reward_id IS NOT NULL AND p_service_type <> 'pickup' THEN
    RAISE EXCEPTION 'reward_pickup_only';
  END IF;

  IF p_service_type = 'delivery' THEN
    IF p_address IS NULL OR coalesce(p_address->>'neighborhood','') = '' THEN
      RAISE EXCEPTION 'invalid_address';
    END IF;
    v_delivery_fee := 5.00;
  END IF;

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

  -- ===================== PERSISTE ENDEREÇO (delivery only) =====================
  IF p_service_type = 'delivery' AND p_address IS NOT NULL AND v_customer_id IS NOT NULL THEN
    v_addr_street     := nullif(trim(coalesce(p_address->>'street','')), '');
    v_addr_number     := nullif(trim(coalesce(p_address->>'number','')), '');
    v_addr_neigh      := nullif(trim(coalesce(p_address->>'neighborhood','')), '');
    v_addr_complement := nullif(trim(coalesce(p_address->>'complement','')), '');
    v_addr_reference  := nullif(trim(coalesce(p_address->>'reference','')), '');

    IF v_addr_street IS NOT NULL AND v_addr_number IS NOT NULL AND v_addr_neigh IS NOT NULL THEN
      -- Procura endereço idêntico já cadastrado para esse cliente
      SELECT id INTO v_existing_addr_id
        FROM public.customer_addresses
       WHERE customer_id = v_customer_id
         AND coalesce(street,'')      = coalesce(v_addr_street,'')
         AND coalesce(number,'')      = coalesce(v_addr_number,'')
         AND coalesce(neighborhood,'')= coalesce(v_addr_neigh,'')
         AND coalesce(complement,'')  = coalesce(v_addr_complement,'')
       LIMIT 1;

      -- Limpa default antigo desse cliente
      UPDATE public.customer_addresses
         SET is_default = false
       WHERE customer_id = v_customer_id AND is_default = true;

      IF v_existing_addr_id IS NOT NULL THEN
        UPDATE public.customer_addresses
           SET is_default = true,
               reference  = COALESCE(v_addr_reference, reference)
         WHERE id = v_existing_addr_id;
      ELSE
        INSERT INTO public.customer_addresses (
          customer_id, street, number, neighborhood, complement, reference, is_default
        ) VALUES (
          v_customer_id, v_addr_street, v_addr_number, v_addr_neigh,
          v_addr_complement, v_addr_reference, true
        );
      END IF;
    END IF;
  END IF;
  -- =============================================================

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

  -- ===================== RESGATE DE BRINDE (pickup only) =====================
  IF p_loyalty_reward_id IS NOT NULL THEN
    v_loyalty_enabled := public._loyalty_setting_bool('loyalty_enabled', false);
    IF NOT v_loyalty_enabled THEN
      RAISE EXCEPTION 'loyalty_disabled';
    END IF;

    v_norm_phone := public.normalize_phone(p_customer_phone);
    IF v_norm_phone IS NULL OR length(v_norm_phone) < 10 THEN
      RAISE EXCEPTION 'phone_required';
    END IF;

    SELECT * INTO v_reward
      FROM public.loyalty_rewards
     WHERE id = p_loyalty_reward_id AND restaurant_id = v_restaurant_id;

    IF NOT FOUND OR NOT v_reward.active THEN
      RAISE EXCEPTION 'reward_inactive';
    END IF;

    IF v_reward.points_cost < 100 THEN
      RAISE EXCEPTION 'reward_below_min_points';
    END IF;

    IF v_items_subtotal < v_reward.min_order_subtotal THEN
      RAISE EXCEPTION 'min_subtotal_not_met';
    END IF;

    INSERT INTO public.loyalty_accounts (phone, balance, total_earned, last_customer_name)
    VALUES (v_norm_phone, 0, 0, p_customer_name)
    ON CONFLICT (phone) DO UPDATE
      SET last_customer_name = COALESCE(EXCLUDED.last_customer_name, public.loyalty_accounts.last_customer_name);

    SELECT balance INTO v_account_balance
      FROM public.loyalty_accounts WHERE phone = v_norm_phone FOR UPDATE;

    IF v_account_balance < v_reward.points_cost THEN
      RAISE EXCEPTION 'insufficient_points';
    END IF;

    UPDATE public.loyalty_accounts
       SET balance = balance - v_reward.points_cost
     WHERE phone = v_norm_phone;

    INSERT INTO public.loyalty_transactions (phone, order_id, kind, points, reward_id)
    VALUES (v_norm_phone, v_order_id, 'redeem', -v_reward.points_cost, v_reward.id);

    INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
    VALUES (v_order_id, v_reward.product_id, '[BRINDE] ' || v_reward.display_name, 0, 1, 0);
  END IF;
  -- =============================================================

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

-- =============================================================
-- 2) RPC pública para buscar último endereço do cliente por telefone
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_last_customer_address(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text;
  v_customer_id uuid;
  v_addr record;
BEGIN
  v_norm := public.normalize_phone(p_phone);
  IF v_norm IS NULL OR length(v_norm) < 10 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_customer_id
    FROM public.customers
   WHERE public.normalize_phone(phone) = v_norm
   LIMIT 1;

  IF v_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT street, number, neighborhood, complement, reference
    INTO v_addr
    FROM public.customer_addresses
   WHERE customer_id = v_customer_id
   ORDER BY is_default DESC, created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'street',       v_addr.street,
    'number',       v_addr.number,
    'neighborhood', v_addr.neighborhood,
    'complement',   v_addr.complement,
    'reference',    v_addr.reference
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_last_customer_address(text) TO anon, authenticated;