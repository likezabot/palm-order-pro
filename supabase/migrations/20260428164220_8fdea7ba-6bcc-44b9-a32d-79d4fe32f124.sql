-- 1. Atualiza create_public_order para permitir resgate em qualquer modalidade
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
  -- 1. Idempotência
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

  -- 2. Identifica restaurante
  SELECT id, default_prep_minutes, delivery_prep_buffer
    INTO v_restaurant_id, v_prep_min, v_buffer_min
  FROM public.restaurants WHERE slug = p_restaurant_slug;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_not_found';
  END IF;

  -- 3. Valida se está aberto
  v_allow_closed := public._setting_bool('allow_public_checkout_when_closed', false);
  IF NOT v_allow_closed AND NOT public.is_restaurant_open(v_restaurant_id) THEN
    RAISE EXCEPTION 'restaurant_closed';
  END IF;

  -- 4. Valida itens
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;
  
  -- 5. Normaliza dados do cliente
  v_norm_phone := public.normalize_phone(p_customer_phone);
  IF v_norm_phone IS NULL OR length(v_norm_phone) < 10 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  -- 6. Configura taxas e endereço
  IF p_service_type = 'delivery' THEN
    IF p_address IS NULL OR coalesce(p_address->>'neighborhood','') = '' THEN
      RAISE EXCEPTION 'invalid_address';
    END IF;
    v_delivery_fee := 5.00;
  END IF;

  -- 7. Validação de Brinde (Sem restrição de modalidade)
  IF v_actual_reward_id IS NOT NULL THEN
    SELECT * INTO v_reward FROM public.loyalty_rewards WHERE id = v_actual_reward_id AND active = true;
    
    IF NOT FOUND THEN 
      v_actual_reward_id := NULL;
    ELSE
      SELECT balance INTO v_account_balance FROM public.loyalty_accounts WHERE phone = v_norm_phone;
      IF v_account_balance IS NULL OR v_account_balance < v_reward.points_cost THEN
        v_actual_reward_id := NULL;
      END IF;
    END IF;
    
    IF v_actual_reward_id IS NOT NULL THEN
      v_reward_name := v_reward.display_name;
      v_points_to_use := v_reward.points_cost;
    END IF;
  END IF;

  -- 8. Processa itens e calcula totais
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

  -- 9. Cria o pedido
  v_eta := now() + (v_prep_min || ' minutes')::interval;
  IF p_service_type = 'delivery' THEN
    v_eta := v_eta + (v_buffer_min || ' minutes')::interval;
  END IF;

  v_auto_approve := public._setting_bool('auto_approve_online_orders', false);

  INSERT INTO public.orders (
    restaurant_id,
    customer_name_snapshot,
    customer_phone_snapshot,
    service_type,
    payment_method,
    status,
    items_subtotal,
    delivery_fee,
    total,
    address_snapshot,
    public_token,
    channel,
    estimated_ready_at,
    notes,
    approved_at,
    approved_by,
    delta_items
  ) VALUES (
    v_restaurant_id,
    trim(p_customer_name),
    v_norm_phone,
    p_service_type,
    p_payment_method,
    'new',
    v_items_subtotal,
    v_delivery_fee,
    v_total,
    p_address,
    v_token,
    'online',
    v_eta,
    p_note,
    CASE WHEN v_auto_approve THEN now() ELSE NULL END,
    CASE WHEN v_auto_approve THEN 'auto' ELSE NULL END,
    jsonb_build_object(
      'client_request_id', p_client_request_id,
      'loyalty_reward_id', v_actual_reward_id,
      'loyalty_reward_name', v_reward_name,
      'points_used', v_points_to_use,
      'auto_approve_requested', v_auto_approve
    )
  ) RETURNING id INTO v_order_id;

  -- 10. Associa itens ao pedido
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

  -- Adiciona o item de brinde se houver
  IF v_actual_reward_id IS NOT NULL THEN
    INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
    VALUES (v_order_id, v_actual_reward_id, '[BRINDE] ' || v_reward_name, 0, 1, 0);
  END IF;

  -- 11. Processa transação de fidelidade (redeem) imediatamente se houver brinde
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

-- 2. Atualiza acúmulo de pontos para permitir qualquer modalidade
CREATE OR REPLACE FUNCTION public._loyalty_on_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_phone        text;
  v_subtotal     numeric := 0;
  v_per_real     numeric;
  v_min_subtotal numeric;
  v_points       integer;
  v_enabled      boolean;
  v_tx           record;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  v_enabled := public._loyalty_setting_bool('loyalty_enabled', false);
  IF NOT v_enabled THEN
    RETURN NEW;
  END IF;

  -- EARN: pedido virou 'paid', QUALQUER modalidade online
  IF OLD.status <> 'paid' AND NEW.status = 'paid'
     AND NEW.channel = 'online'
  THEN
    v_phone := public.normalize_phone(NEW.customer_phone_snapshot);
    IF v_phone IS NOT NULL AND length(v_phone) >= 10 THEN
      SELECT COALESCE(SUM(oi.subtotal), 0)
        INTO v_subtotal
      FROM public.order_items oi
      WHERE oi.order_id = NEW.id
        AND oi.product_price > 0
        AND oi.product_name NOT LIKE '[BRINDE]%'
        AND lower(oi.product_name) NOT LIKE '%casco%'
        AND lower(oi.product_name) NOT LIKE '%retornavel%'
        AND lower(oi.product_name) NOT LIKE '%retornável%';

      v_per_real     := public._loyalty_setting_numeric('loyalty_points_per_real', 1);
      v_min_subtotal := public._loyalty_setting_numeric('loyalty_min_subtotal_to_earn', 0);
      v_points       := floor(v_subtotal * v_per_real)::integer;

      IF v_points > 0 AND v_subtotal >= v_min_subtotal THEN
        INSERT INTO public.loyalty_accounts (phone, balance, total_earned, last_customer_name)
        VALUES (v_phone, 0, 0, NEW.customer_name_snapshot)
        ON CONFLICT (phone) DO UPDATE
          SET last_customer_name = COALESCE(EXCLUDED.last_customer_name, public.loyalty_accounts.last_customer_name);

        BEGIN
          INSERT INTO public.loyalty_transactions (phone, order_id, kind, points)
          VALUES (v_phone, NEW.id, 'earn', v_points);

          UPDATE public.loyalty_accounts
             SET balance      = balance + v_points,
                 total_earned = total_earned + v_points
           WHERE phone = v_phone;
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
      END IF;
    END IF;
  END IF;

  -- CANCEL: estorno de earn
  IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
    FOR v_tx IN
      SELECT t.phone, t.points
        FROM public.loyalty_transactions t
       WHERE t.order_id = NEW.id
         AND t.kind = 'earn'
         AND NOT EXISTS (
           SELECT 1 FROM public.loyalty_transactions r
            WHERE r.order_id = t.order_id
              AND r.kind = 'reversal'
              AND r.phone = t.phone
         )
    LOOP
      INSERT INTO public.loyalty_transactions (phone, order_id, kind, points)
      VALUES (v_tx.phone, NEW.id, 'reversal', -v_tx.points);

      UPDATE public.loyalty_accounts
         SET balance = GREATEST(0, balance - v_tx.points)
       WHERE phone = v_tx.phone;
    END LOOP;

    -- Devolve pontos de redeem
    FOR v_tx IN
      SELECT t.phone, t.points, t.reward_id
        FROM public.loyalty_transactions t
       WHERE t.order_id = NEW.id
         AND t.kind = 'redeem'
         AND NOT EXISTS (
           SELECT 1 FROM public.loyalty_transactions r
            WHERE r.order_id = t.order_id
              AND r.kind = 'redeem_reversal'
              AND r.phone = t.phone
         )
    LOOP
      INSERT INTO public.loyalty_transactions (phone, order_id, kind, points, reward_id)
      VALUES (v_tx.phone, NEW.id, 'redeem_reversal', -v_tx.points, v_tx.reward_id);

      UPDATE public.loyalty_accounts
         SET balance = balance + ABS(v_tx.points)
       WHERE phone = v_tx.phone;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;