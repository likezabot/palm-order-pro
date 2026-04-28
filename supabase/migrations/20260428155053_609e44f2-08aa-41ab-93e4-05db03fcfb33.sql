-- Adiciona configuração global para permitir checkout com loja fechada
INSERT INTO public.settings (key, value)
VALUES ('allow_public_checkout_when_closed', 'true')
ON CONFLICT (key) DO UPDATE SET value = 'true';

-- Atualiza a função principal de criação de pedidos
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
  -- 1. Idempotência (evitar pedidos duplicados por clique duplo ou retry)
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

  -- 3. Valida se está aberto (ou se permite finalizar fechado)
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
    -- Taxa fixa por enquanto
    v_delivery_fee := 5.00;
  END IF;

  -- 7. Validação de Brinde
  IF v_actual_reward_id IS NOT NULL THEN
    SELECT * INTO v_reward FROM public.loyalty_rewards WHERE id = v_actual_reward_id AND active = true;
    
    IF NOT FOUND THEN 
      v_actual_reward_id := NULL;
    ELSE
      SELECT balance INTO v_account_balance FROM public.loyalty_accounts WHERE phone = v_norm_phone;
      IF v_account_balance IS NULL OR v_account_balance < v_reward.points_cost THEN
        v_actual_reward_id := NULL;
      ELSE
        -- Valida método de serviço
        IF p_service_type = 'delivery' AND NOT v_reward.allow_delivery THEN
           v_actual_reward_id := NULL;
        ELSIF (p_service_type = 'pickup' OR p_service_type = 'dine_in') AND NOT v_reward.allow_pickup THEN
           v_actual_reward_id := NULL;
        END IF;
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
    EXCEPTION WHEN others THEN
      CONTINUE; -- Ignora item inválido
    END;
    
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    IF v_qty < 1 THEN CONTINUE; END IF;

    SELECT name, price INTO v_pname, v_pprice
    FROM public.products
    WHERE id = v_pid AND active = true;

    IF v_pname IS NOT NULL THEN
      v_items_subtotal := v_items_subtotal + (v_pprice * v_qty);
      v_normalized_items := v_normalized_items || jsonb_build_object(
        'product_id', v_pid,
        'product_name', v_pname,
        'product_price', v_pprice,
        'quantity', v_qty,
        'note', v_item->>'note'
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_normalized_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart_processed';
  END IF;

  v_total := v_items_subtotal + v_delivery_fee;

  -- 9. Cria ou atualiza perfil do cliente
  v_customer_id := public.get_or_create_customer(
    v_norm_phone, 
    p_customer_name,
    nullif(trim(coalesce(p_address->>'street','')), ''),
    nullif(trim(coalesce(p_address->>'number','')), ''),
    nullif(trim(coalesce(p_address->>'neighborhood','')), ''),
    nullif(trim(coalesce(p_address->>'complement','')), ''),
    nullif(trim(coalesce(p_address->>'reference','')), ''),
    p_service_type,
    p_payment_method
  );

  -- 10. Define status e nome da mesa/identificador
  v_auto_approve := public._setting_bool('auto_approve_online_orders', false);
  
  v_table_name := CASE 
    WHEN p_service_type = 'delivery' THEN 'Delivery #' || substring(v_token::text from 1 for 6)
    WHEN p_service_type = 'pickup' THEN 'Retirada #' || substring(v_token::text from 1 for 6)
    ELSE 'Online #' || substring(v_token::text from 1 for 6)
  END;

  -- 11. Insere o pedido (STATUS SEMPRE 'new', auto-aprovação via approved_at)
  INSERT INTO public.orders (
    restaurant_id,
    table_name,
    customer_id,
    customer_name_snapshot,
    customer_phone_snapshot,
    status,
    approved_at,
    approved_by,
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
    v_table_name,
    v_customer_id,
    p_customer_name,
    v_norm_phone,
    'new',
    CASE WHEN v_auto_approve THEN now() ELSE NULL END,
    CASE WHEN v_auto_approve THEN 'auto' ELSE NULL END,
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
      'loyalty_reward_id', v_actual_reward_id,
      'reward_name', v_reward_name,
      'points_used', v_points_to_use,
      'note', p_note,
      'auto_approved', v_auto_approve
    )
  )
  RETURNING id, estimated_ready_at INTO v_order_id, v_eta;

  -- 12. Insere itens
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

  -- 13. Processa pontos de resgate se houve brinde
  IF v_actual_reward_id IS NOT NULL THEN
    UPDATE public.loyalty_accounts 
       SET balance = balance - v_points_to_use,
           updated_at = now()
     WHERE phone = v_norm_phone;
     
    INSERT INTO public.loyalty_transactions (phone, order_id, kind, points, reward_id)
    VALUES (v_norm_phone, v_order_id, 'redeem', -ABS(v_points_to_use), v_actual_reward_id);
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
