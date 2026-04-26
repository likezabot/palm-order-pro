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
      'p_table_name text, p_waiter_name text, p_total numeric, p_items jsonb, p_should_print boolean, p_original_table_name text'
    ),
    'update_order_items', jsonb_build_array(
      'p_order_id uuid, p_items jsonb, p_total numeric, p_should_print boolean, p_print_type text, p_delta_items jsonb, p_expected_version integer'
    ),
    'pay_order', jsonb_build_array(
      'p_order_id uuid, p_payment_method text, p_amount_paid numeric, p_should_print boolean'
    ),
    'approve_online_order', jsonb_build_array(
      'p_order_id uuid, p_approver text'
    ),
    'reject_online_order', jsonb_build_array(
      'p_order_id uuid, p_approver text, p_reason text'
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
        'code', 'rpc_missing',
        'severity', 'error',
        'function', fname,
        'message', format('RPC %s não existe no schema public', fname),
        'expected_signatures', sigs
      );
      CONTINUE;
    END IF;

    sig_count := jsonb_array_length(sigs);

    IF sig_count = 1 AND v_count <> 1 THEN
      v_issues := v_issues || jsonb_build_object(
        'code', 'rpc_duplicate',
        'severity', 'error',
        'function', fname,
        'message', format('RPC %s tem %s versões (esperado: 1)', fname, v_count),
        'count', v_count,
        'expected_signatures', sigs
      );
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
          'code', 'rpc_signature_mismatch',
          'severity', 'error',
          'function', fname,
          'message', format('RPC %s não tem a assinatura esperada', fname),
          'expected', sig_text,
          'found', coalesce(v_args, '(none)')
        );
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