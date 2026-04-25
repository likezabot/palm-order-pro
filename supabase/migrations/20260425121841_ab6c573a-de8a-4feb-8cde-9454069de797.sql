-- Garante config padrão de auto-aprovação ligada
INSERT INTO public.settings (key, value)
VALUES ('auto_approve_online_orders', 'true')
ON CONFLICT (key) DO NOTHING;

-- Índice de idempotência para client_request_id no canal online (em delivery_address->>'client_request_id')
CREATE INDEX IF NOT EXISTS idx_orders_client_request_id
  ON public.orders ((delivery_address->>'client_request_id'))
  WHERE channel = 'online' AND delivery_address ? 'client_request_id';

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
  p_client_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_existing_id uuid;
  v_total numeric := 0;
  v_delivery_fee numeric := 0;
  v_customer_id uuid;
  v_auto_approve boolean := true;
  v_status text;
  v_print_status text;
  v_table_name text;
  v_estimated_ready timestamptz;
  v_prep_minutes int := 25;
  v_address jsonb;
  v_max_price constant numeric := 9999.99;
  v_clean_phone text;
  v_clean_name text;
  v_service text;
  v_payment text;
BEGIN
  -- Validações básicas
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items_required';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'too_many_items';
  END IF;

  v_clean_name := NULLIF(trim(coalesce(p_customer_name, '')), '');
  v_clean_phone := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  IF v_clean_name IS NULL THEN RAISE EXCEPTION 'customer_name_required'; END IF;
  IF length(v_clean_phone) < 10 THEN RAISE EXCEPTION 'customer_phone_invalid'; END IF;

  v_service := lower(trim(coalesce(p_service_type, 'pickup')));
  IF v_service NOT IN ('delivery', 'pickup', 'dine_in') THEN
    RAISE EXCEPTION 'invalid_service_type';
  END IF;

  v_payment := lower(trim(coalesce(p_payment_method, '')));
  IF v_payment NOT IN ('pix', 'cash', 'card', 'card_credit', 'card_debit') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;

  -- Idempotência: se já existe pedido com esse client_request_id, retorna ele
  IF p_client_request_id IS NOT NULL AND length(trim(p_client_request_id)) > 0 THEN
    SELECT id INTO v_existing_id
    FROM public.orders
    WHERE channel = 'online'
      AND delivery_address->>'client_request_id' = trim(p_client_request_id)
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'id', v_existing_id,
        'idempotent', true,
        'estimated_ready_at', (SELECT estimated_ready_at FROM public.orders WHERE id = v_existing_id)
      );
    END IF;
  END IF;

  -- Lê config de auto-approve
  SELECT (value = 'true') INTO v_auto_approve
  FROM public.settings WHERE key = 'auto_approve_online_orders';
  v_auto_approve := COALESCE(v_auto_approve, true);

  -- Lê tempo de preparo do restaurante (se existir slug)
  IF p_restaurant_slug IS NOT NULL THEN
    SELECT default_prep_minutes INTO v_prep_minutes
    FROM public.restaurants WHERE slug = p_restaurant_slug LIMIT 1;
    v_prep_minutes := COALESCE(v_prep_minutes, 25);
  END IF;

  -- Cliente: get-or-create por telefone
  SELECT id INTO v_customer_id FROM public.customers WHERE phone = v_clean_phone LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (phone, name)
    VALUES (v_clean_phone, v_clean_name)
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.customers
    SET name = COALESCE(v_clean_name, name),
        last_order_at = now(),
        total_orders = total_orders + 1,
        updated_at = now()
    WHERE id = v_customer_id;
  END IF;

  -- Endereço (somente exigido para delivery)
  IF v_service = 'delivery' THEN
    IF p_address IS NULL OR p_address = '{}'::jsonb THEN
      RAISE EXCEPTION 'address_required_for_delivery';
    END IF;
  END IF;

  -- Monta delivery_address com client_request_id embutido para idempotência
  v_address := COALESCE(p_address, '{}'::jsonb);
  IF p_client_request_id IS NOT NULL AND length(trim(p_client_request_id)) > 0 THEN
    v_address := v_address || jsonb_build_object('client_request_id', trim(p_client_request_id));
  END IF;
  IF p_note IS NOT NULL AND length(trim(p_note)) > 0 THEN
    v_address := v_address || jsonb_build_object('note', trim(p_note));
  END IF;

  -- Status conforme auto-approve
  IF v_auto_approve THEN
    v_status := 'new';
    v_print_status := 'pending';
  ELSE
    v_status := 'pending_approval';
    v_print_status := 'printed'; -- não imprime até aprovar
  END IF;

  v_estimated_ready := now() + make_interval(mins => v_prep_minutes);

  -- Nome de "mesa" lógica para online
  v_table_name := CASE
    WHEN v_service = 'delivery' THEN 'DELIVERY #' || substr(v_clean_phone, length(v_clean_phone)-3)
    WHEN v_service = 'pickup'   THEN 'RETIRADA ' || v_clean_name
    ELSE 'BALCÃO ONLINE'
  END;

  -- Cria pedido
  INSERT INTO public.orders (
    table_name, original_table_name, waiter_name, total, status,
    print_status, print_type, version, channel, service_type,
    customer_id, customer_name_snapshot, customer_phone_snapshot,
    payment_method, change_for, delivery_address, delivery_fee,
    estimated_ready_at, public_token,
    approved_at, approved_by
  )
  VALUES (
    v_table_name, v_table_name, 'Online', 0, v_status,
    v_print_status, 'full', 1, 'online', v_service,
    v_customer_id, v_clean_name, v_clean_phone,
    v_payment, p_change_for, v_address, v_delivery_fee,
    v_estimated_ready, gen_random_uuid(),
    CASE WHEN v_auto_approve THEN now() ELSE NULL END,
    CASE WHEN v_auto_approve THEN 'auto' ELSE NULL END
  )
  RETURNING id INTO v_order_id;

  -- Insere itens recalculando preço autoritativo
  WITH inserted AS (
    INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal, waiter_name)
    SELECT
      v_order_id,
      CASE WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
           THEN (item->>'product_id')::uuid ELSE NULL END,
      item->>'product_name',
      CASE
        WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
             AND EXISTS(SELECT 1 FROM public.products WHERE id = (item->>'product_id')::uuid)
          THEN (SELECT price FROM public.products WHERE id = (item->>'product_id')::uuid)
        ELSE LEAST(GREATEST(COALESCE((item->>'product_price')::numeric, 0), 0), v_max_price)
      END,
      LEAST(GREATEST(COALESCE((item->>'quantity')::int, 1), 1), 999),
      NULLIF(item->>'note', ''),
      (CASE
        WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
             AND EXISTS(SELECT 1 FROM public.products WHERE id = (item->>'product_id')::uuid)
          THEN (SELECT price FROM public.products WHERE id = (item->>'product_id')::uuid)
        ELSE LEAST(GREATEST(COALESCE((item->>'product_price')::numeric, 0), 0), v_max_price)
      END) * LEAST(GREATEST(COALESCE((item->>'quantity')::int, 1), 1), 999),
      'Online'
    FROM jsonb_array_elements(p_items) AS item
    RETURNING subtotal
  )
  SELECT COALESCE(SUM(subtotal), 0) INTO v_total FROM inserted;

  UPDATE public.orders SET total = v_total + v_delivery_fee WHERE id = v_order_id;

  -- Se auto-aprovado, enfileira print_job tipo 'order' (.exe vai consumir)
  IF v_auto_approve THEN
    INSERT INTO public.print_jobs (order_id, job_type, status, payload)
    VALUES (
      v_order_id, 'order', 'queued',
      jsonb_build_object('source', 'public_menu', 'service_type', v_service)
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'idempotent', false,
    'status', v_status,
    'auto_approved', v_auto_approve,
    'estimated_ready_at', v_estimated_ready,
    'total', v_total + v_delivery_fee
  );
END;
$$;