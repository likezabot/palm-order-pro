-- =========================================================================
-- Adiciona p_customer_name ao create_order para pedidos BALCÃO (counter)
--
-- IMPORTANTE: fazemos DROP da assinatura antiga ANTES do CREATE OR REPLACE
-- para evitar PGRST203 "Could not choose the best candidate function".
-- =========================================================================

DROP FUNCTION IF EXISTS public.create_order(text, text, numeric, jsonb, boolean, text);

CREATE OR REPLACE FUNCTION public.create_order(
  p_table_name           text,
  p_waiter_name          text,
  p_total                numeric,
  p_items                jsonb,
  p_should_print         boolean DEFAULT true,
  p_original_table_name  text    DEFAULT NULL,
  p_customer_name        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id    uuid;
  v_order       record;
  v_print_status text;
  v_existing_id  uuid;
  v_existing_name text;
  v_original    text;
  v_real_total  numeric := 0;
  v_max_custom_price constant numeric := 9999.99;
  v_customer    text;
BEGIN
  IF p_table_name IS NULL OR p_table_name = '' THEN RAISE EXCEPTION 'table_name is required'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'items are required'; END IF;
  IF jsonb_array_length(p_items) > 200 THEN RAISE EXCEPTION 'too_many_items'; END IF;

  v_original := COALESCE(NULLIF(trim(p_original_table_name), ''), p_table_name);
  v_customer := NULLIF(trim(coalesce(p_customer_name, '')), '');

  IF v_original <> 'BALCÃO' THEN
    SELECT id, table_name INTO v_existing_id, v_existing_name
    FROM public.orders
    WHERE status IN ('new','preparing','done')
      AND (original_table_name = v_original
           OR (original_table_name IS NULL AND table_name = v_original))
    ORDER BY created_at DESC LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'table_already_in_use:%:%', v_existing_id, v_existing_name;
    END IF;
  END IF;

  v_print_status := CASE WHEN p_should_print THEN 'pending' ELSE 'printed' END;

  INSERT INTO public.orders (
    table_name, original_table_name, waiter_name,
    total, status, print_status, version,
    customer_name_snapshot
  )
  VALUES (
    p_table_name, v_original, NULLIF(p_waiter_name, ''),
    0, 'new', v_print_status, 1,
    v_customer
  )
  RETURNING id INTO v_order_id;

  -- Insere itens recalculando subtotal a partir do preço REAL do produto
  WITH inserted AS (
    INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal, waiter_name)
    SELECT
      v_order_id,
      CASE WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
           THEN (item->>'product_id')::uuid ELSE NULL END AS pid,
      item->>'product_name',
      CASE
        WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
             AND EXISTS(SELECT 1 FROM public.products WHERE id = (item->>'product_id')::uuid)
          THEN (SELECT price FROM public.products WHERE id = (item->>'product_id')::uuid)
        ELSE LEAST(GREATEST(COALESCE((item->>'product_price')::numeric, 0), 0), v_max_custom_price)
      END AS real_price,
      LEAST(GREATEST(COALESCE((item->>'quantity')::int, 1), 1), 999) AS qty,
      NULLIF(item->>'note', ''),
      (CASE
        WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') <> ''
             AND EXISTS(SELECT 1 FROM public.products WHERE id = (item->>'product_id')::uuid)
          THEN (SELECT price FROM public.products WHERE id = (item->>'product_id')::uuid)
        ELSE LEAST(GREATEST(COALESCE((item->>'product_price')::numeric, 0), 0), v_max_custom_price)
      END) * LEAST(GREATEST(COALESCE((item->>'quantity')::int, 1), 1), 999),
      COALESCE(NULLIF(item->>'waiter_name', ''), NULLIF(p_waiter_name, ''))
    FROM jsonb_array_elements(p_items) AS item
    RETURNING subtotal
  )
  SELECT COALESCE(SUM(subtotal), 0) INTO v_real_total FROM inserted;

  UPDATE public.orders SET total = v_real_total WHERE id = v_order_id;

  SELECT id, created_at INTO v_order FROM public.orders WHERE id = v_order_id;
  RETURN jsonb_build_object('id', v_order_id, 'created_at', v_order.created_at, 'total', v_real_total);
END;
$$;

-- Garante permissão para anon e authenticated na nova assinatura
GRANT EXECUTE ON FUNCTION public.create_order(text, text, numeric, jsonb, boolean, text, text) TO anon, authenticated;

-- Atualiza verify_rpc_consistency para a nova assinatura
CREATE OR REPLACE FUNCTION public.verify_rpc_consistency()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issues jsonb := '[]'::jsonb;
  v_count int;
  v_args text;
  expected jsonb := jsonb_build_object(
    'create_public_order', jsonb_build_array(
      'p_restaurant_slug text, p_customer_name text, p_customer_phone text, p_service_type text, p_payment_method text, p_change_for numeric, p_address jsonb, p_items jsonb, p_note text, p_client_request_id text'
    ),
    'create_order', jsonb_build_array(
      'p_table_name text, p_waiter_name text, p_total numeric, p_items jsonb, p_should_print boolean, p_original_table_name text, p_customer_name text'
    ),
    'update_order_items', jsonb_build_array(
      'p_order_id uuid, p_total numeric, p_items jsonb, p_delta_items jsonb, p_print_type text, p_expected_version integer, p_should_print boolean'
    ),
    'pay_order', jsonb_build_array(
      'p_order_id uuid, p_payment_method text, p_amount_paid numeric, p_should_print boolean'
    ),
    'approve_online_order', jsonb_build_array(
      'p_order_id uuid, p_approver text'
    ),
    'reject_online_order', jsonb_build_array(
      'p_order_id uuid, p_reason text, p_approver text'
    ),
    'admin_edit_online_order_item', jsonb_build_array(
      'p_order_id uuid, p_item_id uuid, p_new_quantity integer'
    ),
    'get_public_order_status', jsonb_build_array(
      'p_order_id uuid, p_token uuid'
    ),
    'enqueue_print_job', jsonb_build_array(
      'p_order_id uuid, p_job_type text, p_payload jsonb'
    ),
    'claim_print_job', jsonb_build_array(''),
    'complete_print_job', jsonb_build_array('p_id uuid'),
    'fail_print_job', jsonb_build_array('p_id uuid, p_error text, p_max_attempts integer'),
    'verify_manager_pin', jsonb_build_array('p_pin text, p_fingerprint text'),
    'toggle_product_active', jsonb_build_array('p_id uuid, p_active boolean'),
    'recover_stuck_prints', jsonb_build_array(''),
    'archive_and_purge_old_data', jsonb_build_array(
      'p_days_keep integer',
      'p_days_keep integer, p_source text'
    )
  );
  fname text;
  sigs jsonb;
  sig_text text;
  sig_count int;
  v_total_checked int;
BEGIN
  v_total_checked := (SELECT count(*) FROM jsonb_object_keys(expected));

  FOR fname, sigs IN SELECT key, value FROM jsonb_each(expected)
  LOOP
    SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = fname;

    IF v_count = 0 THEN
      v_issues := v_issues || jsonb_build_object(
        'code', 'rpc_missing', 'severity', 'error', 'function', fname,
        'message', format('RPC %s não existe no schema public', fname),
        'expected_signatures', sigs);
      CONTINUE;
    END IF;

    sig_count := jsonb_array_length(sigs);

    IF sig_count = 1 AND v_count <> 1 THEN
      v_issues := v_issues || jsonb_build_object(
        'code', 'rpc_duplicate', 'severity', 'error', 'function', fname,
        'message', format('RPC %s tem %s versões (esperado: 1)', fname, v_count),
        'count', v_count, 'expected_signatures', sigs);
    END IF;

    FOR sig_text IN SELECT jsonb_array_elements_text(sigs)
    LOOP
      SELECT count(*) INTO v_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = fname
        AND lower(regexp_replace(pg_get_function_identity_arguments(p.oid), '\s+', ' ', 'g'))
            = lower(regexp_replace(sig_text, '\s+', ' ', 'g'));

      IF v_count = 0 THEN
        SELECT string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
          INTO v_args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = fname;

        v_issues := v_issues || jsonb_build_object(
          'code', 'rpc_signature_mismatch', 'severity', 'error', 'function', fname,
          'message', format('RPC %s não tem a assinatura esperada', fname),
          'expected', sig_text, 'found', coalesce(v_args, '(none)'));
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'total_functions_checked', v_total_checked,
    'issues_count', jsonb_array_length(v_issues),
    'issues', v_issues
  );
END;
$$;
