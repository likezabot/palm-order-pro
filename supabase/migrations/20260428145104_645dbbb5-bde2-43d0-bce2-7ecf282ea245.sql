-- 1. Expande a tabela de clientes
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS street TEXT,
ADD COLUMN IF NOT EXISTS number TEXT,
ADD COLUMN IF NOT EXISTS neighborhood TEXT,
ADD COLUMN IF NOT EXISTS complement TEXT,
ADD COLUMN IF NOT EXISTS reference TEXT,
ADD COLUMN IF NOT EXISTS last_service_type TEXT,
ADD COLUMN IF NOT EXISTS last_payment_method TEXT;

-- 2. Expande a tabela de brindes
ALTER TABLE public.loyalty_rewards
ADD COLUMN IF NOT EXISTS allow_pickup BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS allow_delivery BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Atualiza normalize_phone para ser mais robusto (mantendo a lógica atual mas centralizando)
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text AS $$
BEGIN
  RETURN NULLIF(regexp_replace(p_phone, '\D', '', 'g'), '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Função para buscar perfil completo do cliente
CREATE OR REPLACE FUNCTION public.get_customer_profile(p_phone text, p_restaurant_slug text)
RETURNS jsonb AS $$
DECLARE
  v_phone text;
  v_cust record;
  v_balance integer := 0;
  v_restaurant_id uuid;
BEGIN
  v_phone := public.normalize_phone(p_phone);
  IF v_phone IS NULL OR length(v_phone) < 10 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_restaurant_id FROM public.restaurants WHERE slug = p_restaurant_slug;

  SELECT * INTO v_cust FROM public.customers WHERE phone = v_phone LIMIT 1;
  
  IF v_cust.phone IS NOT NULL THEN
    SELECT COALESCE(balance, 0) INTO v_balance
      FROM public.loyalty_accounts WHERE phone = v_phone;
  END IF;

  IF v_cust.phone IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'name', v_cust.name,
    'phone', v_cust.phone,
    'street', v_cust.street,
    'number', v_cust.number,
    'neighborhood', v_cust.neighborhood,
    'complement', v_cust.complement,
    'reference', v_cust.reference,
    'last_service_type', v_cust.last_service_type,
    'last_payment_method', v_cust.last_payment_method,
    'points_balance', v_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Atualiza get_public_loyalty_status para usar as novas flags de entrega/retirada
CREATE OR REPLACE FUNCTION public.get_public_loyalty_status(
  p_phone text,
  p_restaurant_slug text,
  p_order_subtotal numeric DEFAULT 0,
  p_service_type text DEFAULT 'pickup'
)
RETURNS jsonb AS $$
DECLARE
  v_enabled       boolean;
  v_phone         text;
  v_balance       integer := 0;
  v_per_real      numeric;
  v_restaurant_id uuid;
  v_rewards       jsonb;
  v_projected     integer := 0;
  v_service_type  text;
BEGIN
  v_enabled := public._loyalty_setting_bool('loyalty_enabled', false);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  v_phone     := public.normalize_phone(p_phone);
  v_per_real  := public._loyalty_setting_numeric('loyalty_points_per_real', 1);
  v_service_type := COALESCE(p_service_type, 'pickup');

  SELECT id INTO v_restaurant_id FROM public.restaurants WHERE slug = p_restaurant_slug;
  IF v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object('enabled', true, 'balance', 0, 'rewards', '[]'::jsonb,
      'points_per_real', v_per_real, 'projected_earn', 0,
      'service_type', v_service_type);
  END IF;

  IF v_phone IS NOT NULL AND length(v_phone) >= 10 THEN
    SELECT COALESCE(balance, 0) INTO v_balance
      FROM public.loyalty_accounts WHERE phone = v_phone;
  END IF;

  -- Plano B: Acumula pontos tanto em pickup quanto em delivery (ajuste conforme necessidade, mas mantendo a lógica do cliente)
  v_projected := floor(GREATEST(COALESCE(p_order_subtotal,0), 0) * v_per_real)::integer;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'display_name', r.display_name,
    'points_cost', r.points_cost,
    'min_order_subtotal', r.min_order_subtotal,
    'available', (
      (CASE WHEN v_service_type = 'delivery' THEN r.allow_delivery ELSE r.allow_pickup END)
      AND v_balance >= r.points_cost
      AND COALESCE(p_order_subtotal, 0) >= r.min_order_subtotal
    ),
    'blocked_reason', CASE
      WHEN NOT (CASE WHEN v_service_type = 'delivery' THEN r.allow_delivery ELSE r.allow_pickup END)
        THEN CASE WHEN v_service_type = 'delivery' THEN 'pickup_only' ELSE 'delivery_only' END
      WHEN v_balance < r.points_cost
        THEN 'missing_points:' || (r.points_cost - v_balance)::text
      WHEN COALESCE(p_order_subtotal, 0) < r.min_order_subtotal
        THEN 'min_subtotal:' || r.min_order_subtotal::text
      ELSE NULL
    END
  ) ORDER BY r.points_cost, r.display_name), '[]'::jsonb)
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
    'service_type', v_service_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Atualiza get_or_create_customer para lidar com os novos campos
CREATE OR REPLACE FUNCTION public.get_or_create_customer(
  p_phone text,
  p_name text,
  p_street text DEFAULT NULL,
  p_number text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_complement text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_last_service_type text DEFAULT NULL,
  p_last_payment_method text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_clean_phone text;
  v_id uuid;
BEGIN
  v_clean_phone := public.normalize_phone(p_phone);
  IF v_clean_phone IS NULL OR length(v_clean_phone) < 10 THEN 
    RAISE EXCEPTION 'invalid_phone'; 
  END IF;

  SELECT id INTO v_id FROM public.customers WHERE phone = v_clean_phone;
  IF v_id IS NOT NULL THEN
    UPDATE public.customers
       SET name = COALESCE(NULLIF(trim(p_name),''), name),
           street = COALESCE(NULLIF(trim(p_street),''), street),
           number = COALESCE(NULLIF(trim(p_number),''), number),
           neighborhood = COALESCE(NULLIF(trim(p_neighborhood),''), neighborhood),
           complement = COALESCE(NULLIF(trim(p_complement),''), complement),
           reference = COALESCE(NULLIF(trim(p_reference),''), reference),
           last_service_type = COALESCE(p_last_service_type, last_service_type),
           last_payment_method = COALESCE(p_last_payment_method, last_payment_method),
           updated_at = now()
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.customers (
    phone, name, street, number, neighborhood, complement, reference, last_service_type, last_payment_method
  )
  VALUES (
    v_clean_phone, 
    NULLIF(trim(p_name),''), 
    NULLIF(trim(p_street),''), 
    NULLIF(trim(p_number),''), 
    NULLIF(trim(p_neighborhood),''), 
    NULLIF(trim(p_complement),''), 
    NULLIF(trim(p_reference),''),
    p_last_service_type,
    p_last_payment_method
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Atualiza create_public_order para usar a nova lógica
CREATE OR REPLACE FUNCTION public.create_public_order(
  p_restaurant_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_service_type text,
  p_payment_method text,
  p_change_for numeric DEFAULT NULL,
  p_address jsonb DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_client_request_id text DEFAULT NULL,
  p_loyalty_reward_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
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
  
  v_norm_phone := public.normalize_phone(p_customer_phone);
  IF v_norm_phone IS NULL OR length(v_norm_phone) < 10 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  IF p_service_type NOT IN ('delivery','pickup','dine_in') THEN
    RAISE EXCEPTION 'invalid_service_type';
  END IF;

  IF p_service_type = 'delivery' THEN
    IF p_address IS NULL OR coalesce(p_address->>'neighborhood','') = '' THEN
      RAISE EXCEPTION 'invalid_address';
    END IF;
    v_delivery_fee := 5.00;
  END IF;

  -- Validação de Brinde
  IF p_loyalty_reward_id IS NOT NULL THEN
    SELECT * INTO v_reward FROM public.loyalty_rewards WHERE id = p_loyalty_reward_id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'reward_inactive'; END IF;

    -- Nova regra: respeita flags de pickup/delivery
    IF p_service_type = 'delivery' AND NOT v_reward.allow_delivery THEN
      RAISE EXCEPTION 'reward_pickup_only';
    ELSIF p_service_type = 'pickup' AND NOT v_reward.allow_pickup THEN
      RAISE EXCEPTION 'reward_delivery_only';
    END IF;

    SELECT balance INTO v_account_balance FROM public.loyalty_accounts WHERE phone = v_norm_phone;
    IF v_account_balance IS NULL OR v_account_balance < v_reward.points_cost THEN
      RAISE EXCEPTION 'insufficient_points';
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_pid := (v_item->>'product_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_product_id';
    END;
    
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    IF v_qty < 1 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

    SELECT name, price INTO v_pname, v_pprice
    FROM public.products
    WHERE id = v_pid AND active = true;

    IF v_pname IS NULL THEN
      RAISE EXCEPTION 'product_unavailable';
    END IF;

    v_items_subtotal := v_items_subtotal + (v_pprice * v_qty);
    v_normalized_items := v_normalized_items || jsonb_build_object(
      'product_id', v_pid,
      'product_name', v_pname,
      'product_price', v_pprice,
      'quantity', v_qty,
      'note', v_item->>'note'
    );
  END LOOP;

  v_total := v_items_subtotal + v_delivery_fee;

  -- Processa endereço para salvar no perfil
  IF p_address IS NOT NULL THEN
    v_addr_street     := nullif(trim(coalesce(p_address->>'street','')), '');
    v_addr_number     := nullif(trim(coalesce(p_address->>'number','')), '');
    v_addr_neigh      := nullif(trim(coalesce(p_address->>'neighborhood','')), '');
    v_addr_complement := nullif(trim(coalesce(p_address->>'complement','')), '');
    v_addr_reference  := nullif(trim(coalesce(p_address->>'reference','')), '');
  END IF;

  -- Cria ou atualiza cliente com dados completos
  v_customer_id := public.get_or_create_customer(
    v_norm_phone, 
    p_customer_name,
    v_addr_street,
    v_addr_number,
    v_addr_neigh,
    v_addr_complement,
    v_addr_reference,
    p_service_type,
    p_payment_method
  );

  -- Determina status inicial
  v_auto_approve := public._setting_bool('auto_approve_online_orders', false);

  -- Insere o pedido
  INSERT INTO public.orders (
    restaurant_id,
    customer_id,
    customer_name_snapshot,
    customer_phone_snapshot,
    status,
    service_type,
    payment_method,
    change_for,
    delivery_address,
    delivery_fee,
    total,
    public_token,
    channel,
    delta_items
  )
  VALUES (
    v_restaurant_id,
    v_customer_id,
    p_customer_name,
    v_norm_phone,
    CASE WHEN v_auto_approve THEN 'approved' ELSE 'pending_approval' END,
    p_service_type,
    p_payment_method,
    p_change_for,
    p_address,
    v_delivery_fee,
    v_total,
    v_token,
    'online',
    jsonb_build_object(
      'client_request_id', p_client_request_id,
      'loyalty_reward_id', p_loyalty_reward_id,
      'reward_name', v_reward.display_name,
      'points_used', v_reward.points_cost,
      'note', p_note
    )
  )
  RETURNING id, estimated_ready_at INTO v_order_id, v_eta;

  -- Insere itens do pedido
  INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal)
  SELECT 
    v_order_id,
    (item->>'product_id')::uuid,
    item->>'product_name',
    (item->>'product_price')::numeric,
    (item->>'quantity')::int,
    item->>'note',
    (item->>'product_price')::numeric * (item->>'quantity')::int
  FROM jsonb_array_elements(v_normalized_items) AS item;

  -- Se houve brinde, desconta os pontos
  IF p_loyalty_reward_id IS NOT NULL THEN
    UPDATE public.loyalty_accounts 
       SET balance = balance - v_reward.points_cost,
           updated_at = now()
     WHERE phone = v_norm_phone;
  END IF;

  -- Se auto-aprovado, já acumula pontos do novo pedido (opcional, pode ser no 'delivered' se preferir, mas mantendo a lógica atual)
  IF v_auto_approve THEN
    PERFORM public.process_order_loyalty(v_order_id);
  END IF;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'public_token', v_token,
    'status', CASE WHEN v_auto_approve THEN 'approved' ELSE 'pending_approval' END,
    'auto_approved', v_auto_approve,
    'estimated_ready_at', v_eta,
    'total', v_total,
    'idempotent', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
