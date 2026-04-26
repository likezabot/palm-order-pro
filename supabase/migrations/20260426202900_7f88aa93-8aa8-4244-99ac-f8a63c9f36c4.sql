-- =============================================================
-- 1) Trigger de ganho de pontos: apenas pickup gera pontos
-- =============================================================
CREATE OR REPLACE FUNCTION public._loyalty_on_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- ===== EARN: pedido virou 'paid', SOMENTE pickup online =====
  IF OLD.status <> 'paid' AND NEW.status = 'paid'
     AND NEW.channel = 'online'
     AND NEW.service_type = 'pickup'
  THEN
    v_phone := public.normalize_phone(NEW.customer_phone_snapshot);
    IF v_phone IS NOT NULL AND length(v_phone) >= 10 THEN
      -- Subtotal pontuável: exclui brindes, casco/retornável e itens R$ 0
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

  -- ===== CANCEL: estorno de earn =====
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

    -- Devolve pontos de redeem se houve resgate
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

-- =============================================================
-- 2) Validação de brindes: min 100 pts, max R$ 80 compra mínima
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_loyalty_upsert_reward(
  p_id uuid,
  p_restaurant_id uuid,
  p_display_name text,
  p_points_cost integer,
  p_min_order_subtotal numeric,
  p_active boolean,
  p_sort_order integer,
  p_product_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_display_name IS NULL OR length(trim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_display_name';
  END IF;
  IF p_points_cost IS NULL OR p_points_cost < 100 THEN
    RAISE EXCEPTION 'points_cost_min_100';
  END IF;
  IF COALESCE(p_min_order_subtotal, 0) > 80 THEN
    RAISE EXCEPTION 'min_subtotal_max_80';
  END IF;
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_restaurant';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.loyalty_rewards
      (restaurant_id, product_id, display_name, points_cost, min_order_subtotal, active, sort_order)
    VALUES
      (p_restaurant_id, p_product_id, trim(p_display_name), p_points_cost,
       COALESCE(p_min_order_subtotal, 0), COALESCE(p_active, true), COALESCE(p_sort_order, 0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.loyalty_rewards
       SET product_id          = p_product_id,
           display_name        = trim(p_display_name),
           points_cost         = p_points_cost,
           min_order_subtotal  = COALESCE(p_min_order_subtotal, 0),
           active              = COALESCE(p_active, true),
           sort_order          = COALESCE(p_sort_order, 0)
     WHERE id = p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'reward_not_found';
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

-- =============================================================
-- 3) Seed completo dos brindes (20 itens) - idempotente
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_loyalty_seed_default_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_reward record;
  v_existing_id uuid;
  v_defaults jsonb := '[
    {"name": "Salada grátis",                    "cost": 100, "min": 25, "sort": 10,  "active": false},
    {"name": "Arroz 200g grátis",                "cost": 100, "min": 25, "sort": 20,  "active": false},
    {"name": "Mini refrigerante grátis",         "cost": 120, "min": 30, "sort": 30,  "active": true},
    {"name": "Refrigerante lata grátis",         "cost": 170, "min": 40, "sort": 40,  "active": false},
    {"name": "Suco Del Valle grátis",            "cost": 170, "min": 40, "sort": 50,  "active": false},
    {"name": "Pão de alho grátis",               "cost": 190, "min": 45, "sort": 60,  "active": true},
    {"name": "Coca 600ml grátis",                "cost": 190, "min": 45, "sort": 70,  "active": false},
    {"name": "Queijo coalho grátis",             "cost": 220, "min": 50, "sort": 80,  "active": false},
    {"name": "Espeto de boi grátis",             "cost": 250, "min": 60, "sort": 90,  "active": true},
    {"name": "Medalhão de frango grátis",        "cost": 250, "min": 60, "sort": 100, "active": false},
    {"name": "Coração de frango grátis",         "cost": 250, "min": 60, "sort": 110, "active": false},
    {"name": "Linguiça grátis",                  "cost": 250, "min": 60, "sort": 120, "active": false},
    {"name": "Tulipa grátis",                    "cost": 250, "min": 60, "sort": 130, "active": false},
    {"name": "Panceta suína grátis",             "cost": 280, "min": 60, "sort": 140, "active": false},
    {"name": "Costelinha suína grátis",          "cost": 280, "min": 60, "sort": 150, "active": false},
    {"name": "Costela de boi grátis",            "cost": 380, "min": 80, "sort": 160, "active": true},
    {"name": "Coca 2L grátis",                   "cost": 420, "min": 80, "sort": 170, "active": true},
    {"name": "Jantinha grátis",                  "cost": 520, "min": 80, "sort": 180, "active": true},
    {"name": "Entrega grátis dia normal",        "cost": 160, "min": 50, "sort": 190, "active": false},
    {"name": "Entrega grátis dia de chuva",      "cost": 260, "min": 80, "sort": 200, "active": false}
  ]'::jsonb;
BEGIN
  SELECT id INTO v_restaurant_id
  FROM public.restaurants
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_restaurant_found');
  END IF;

  FOR v_reward IN
    SELECT
      (elem->>'name')::text     AS display_name,
      (elem->>'cost')::int      AS points_cost,
      (elem->>'min')::numeric   AS min_order_subtotal,
      (elem->>'sort')::int      AS sort_order,
      (elem->>'active')::boolean AS active
    FROM jsonb_array_elements(v_defaults) AS elem
  LOOP
    SELECT id INTO v_existing_id
    FROM public.loyalty_rewards
    WHERE restaurant_id = v_restaurant_id
      AND lower(display_name) = lower(v_reward.display_name)
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.loyalty_rewards
      SET points_cost        = v_reward.points_cost,
          min_order_subtotal = v_reward.min_order_subtotal,
          sort_order         = v_reward.sort_order,
          active             = v_reward.active,
          updated_at         = now()
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.loyalty_rewards (
        restaurant_id, display_name, points_cost,
        min_order_subtotal, active, sort_order
      ) VALUES (
        v_restaurant_id, v_reward.display_name, v_reward.points_cost,
        v_reward.min_order_subtotal, v_reward.active, v_reward.sort_order
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'restaurant_id', v_restaurant_id,
    'inserted', v_inserted,
    'updated', v_updated
  );
END;
$function$;

-- =============================================================
-- 4) get_public_loyalty_status: aceita service_type opcional
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_public_loyalty_status(
  p_phone text,
  p_restaurant_slug text,
  p_order_subtotal numeric DEFAULT 0,
  p_service_type text DEFAULT 'pickup'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled       boolean;
  v_phone         text;
  v_balance       integer := 0;
  v_per_real      numeric;
  v_restaurant_id uuid;
  v_rewards       jsonb;
  v_is_pickup     boolean;
  v_projected     integer := 0;
BEGIN
  v_enabled := public._loyalty_setting_bool('loyalty_enabled', false);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  v_phone     := public.normalize_phone(p_phone);
  v_per_real  := public._loyalty_setting_numeric('loyalty_points_per_real', 1);
  v_is_pickup := COALESCE(p_service_type, 'pickup') = 'pickup';

  SELECT id INTO v_restaurant_id FROM public.restaurants WHERE slug = p_restaurant_slug;
  IF v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object('enabled', true, 'balance', 0, 'rewards', '[]'::jsonb,
      'points_per_real', v_per_real, 'projected_earn', 0,
      'service_type', COALESCE(p_service_type, 'pickup'));
  END IF;

  IF v_phone IS NOT NULL AND length(v_phone) >= 10 THEN
    SELECT COALESCE(balance, 0) INTO v_balance
      FROM public.loyalty_accounts WHERE phone = v_phone;
    IF v_balance IS NULL THEN v_balance := 0; END IF;
  END IF;

  -- Pontos previstos: só pickup acumula
  IF v_is_pickup THEN
    v_projected := floor(GREATEST(COALESCE(p_order_subtotal,0), 0) * v_per_real)::integer;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'display_name', r.display_name,
    'points_cost', r.points_cost,
    'min_order_subtotal', r.min_order_subtotal,
    'available', (
      v_is_pickup
      AND v_balance >= r.points_cost
      AND COALESCE(p_order_subtotal, 0) >= r.min_order_subtotal
    ),
    'blocked_reason', CASE
      WHEN NOT v_is_pickup
        THEN 'pickup_only'
      WHEN v_balance < r.points_cost
        THEN 'missing_points:' || (r.points_cost - v_balance)::text
      WHEN COALESCE(p_order_subtotal, 0) < r.min_order_subtotal
        THEN 'min_subtotal:' || r.min_order_subtotal::text
      ELSE NULL
    END
  ) ORDER BY r.sort_order, r.display_name), '[]'::jsonb)
  INTO v_rewards
  FROM public.loyalty_rewards r
  WHERE r.restaurant_id = v_restaurant_id
    AND r.active = true;

  RETURN jsonb_build_object(
    'enabled', true,
    'balance', v_balance,
    'rewards', v_rewards,
    'points_per_real', v_per_real,
    'projected_earn', v_projected,
    'service_type', COALESCE(p_service_type, 'pickup')
  );
END;
$function$;

-- =============================================================
-- 5) create_public_order: bloqueia brinde fora de pickup
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

  -- Bloqueio: brinde só em pickup
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