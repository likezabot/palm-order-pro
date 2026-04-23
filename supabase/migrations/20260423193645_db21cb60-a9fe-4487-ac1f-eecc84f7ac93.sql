CREATE OR REPLACE FUNCTION public.preview_operational_data_period(p_days int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb := '{}'::jsonb;
  v_cutoff timestamptz;
  v_use_cutoff boolean := p_days IS NOT NULL AND p_days >= 0;
BEGIN
  IF v_use_cutoff THEN
    v_cutoff := now() - make_interval(days => p_days);
  END IF;

  v := v || jsonb_build_object('period_days', COALESCE(p_days, -1));
  v := v || jsonb_build_object('cutoff', COALESCE(v_cutoff::text, 'all'));

  v := v || jsonb_build_object('orders',
    (SELECT count(*) FROM orders WHERE NOT v_use_cutoff OR created_at >= v_cutoff));
  v := v || jsonb_build_object('order_items',
    (SELECT count(*) FROM order_items oi
     WHERE NOT v_use_cutoff OR EXISTS(
       SELECT 1 FROM orders o WHERE o.id = oi.order_id AND o.created_at >= v_cutoff)));
  v := v || jsonb_build_object('cash_register',
    (SELECT count(*) FROM cash_register WHERE NOT v_use_cutoff OR COALESCE(opened_at, closed_at) >= v_cutoff));
  v := v || jsonb_build_object('cash_movements',
    (SELECT count(*) FROM cash_movements WHERE NOT v_use_cutoff OR created_at >= v_cutoff));
  v := v || jsonb_build_object('inventory_movements',
    (SELECT count(*) FROM inventory_movements WHERE NOT v_use_cutoff OR created_at >= v_cutoff));
  v := v || jsonb_build_object('stock_movements',
    (SELECT count(*) FROM stock_movements WHERE NOT v_use_cutoff OR created_at >= v_cutoff));
  v := v || jsonb_build_object('notification_queue',
    (SELECT count(*) FROM notification_queue WHERE NOT v_use_cutoff OR created_at >= v_cutoff));
  v := v || jsonb_build_object('notification_log',
    (SELECT count(*) FROM notification_log WHERE NOT v_use_cutoff OR sent_at >= v_cutoff));
  v := v || jsonb_build_object('telegram_chat_state',
    (SELECT count(*) FROM telegram_chat_state WHERE NOT v_use_cutoff OR updated_at >= v_cutoff));
  v := v || jsonb_build_object('telegram_undo_stack',
    (SELECT count(*) FROM telegram_undo_stack WHERE NOT v_use_cutoff OR created_at >= v_cutoff));
  v := v || jsonb_build_object('inventory_items_with_stock',
    (SELECT count(*) FROM inventory_items WHERE current_stock <> 0));
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_operational_data_period(p_days int DEFAULT NULL, p_reset_stock boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_count int;
  v_cutoff timestamptz;
  v_use_cutoff boolean := p_days IS NOT NULL AND p_days >= 0;
BEGIN
  IF v_use_cutoff THEN
    v_cutoff := now() - make_interval(days => p_days);
  END IF;

  -- order_items: filtra via join com orders no período
  IF v_use_cutoff THEN
    DELETE FROM order_items oi
    USING orders o
    WHERE oi.order_id = o.id AND o.created_at >= v_cutoff;
  ELSE
    DELETE FROM order_items;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_items', v_count);

  IF v_use_cutoff THEN
    DELETE FROM orders WHERE created_at >= v_cutoff;
  ELSE
    DELETE FROM orders;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders', v_count);

  -- cash_movements: por created_at
  IF v_use_cutoff THEN
    DELETE FROM cash_movements WHERE created_at >= v_cutoff;
  ELSE
    DELETE FROM cash_movements;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cash_movements', v_count);

  -- cash_register: opened_at OR closed_at no período
  IF v_use_cutoff THEN
    DELETE FROM cash_register WHERE COALESCE(opened_at, closed_at) >= v_cutoff;
  ELSE
    DELETE FROM cash_register;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cash_register', v_count);

  IF v_use_cutoff THEN
    DELETE FROM inventory_movements WHERE created_at >= v_cutoff;
  ELSE
    DELETE FROM inventory_movements;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('inventory_movements', v_count);

  IF v_use_cutoff THEN
    DELETE FROM stock_movements WHERE created_at >= v_cutoff;
  ELSE
    DELETE FROM stock_movements;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('stock_movements', v_count);

  IF v_use_cutoff THEN
    DELETE FROM notification_queue WHERE created_at >= v_cutoff;
  ELSE
    DELETE FROM notification_queue;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('notification_queue', v_count);

  IF v_use_cutoff THEN
    DELETE FROM notification_log WHERE sent_at >= v_cutoff;
  ELSE
    DELETE FROM notification_log;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('notification_log', v_count);

  IF v_use_cutoff THEN
    DELETE FROM telegram_chat_state WHERE updated_at >= v_cutoff;
  ELSE
    DELETE FROM telegram_chat_state;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('telegram_chat_state', v_count);

  IF v_use_cutoff THEN
    DELETE FROM telegram_undo_stack WHERE created_at >= v_cutoff;
  ELSE
    DELETE FROM telegram_undo_stack;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('telegram_undo_stack', v_count);

  IF p_reset_stock THEN
    UPDATE inventory_items SET current_stock = 0, updated_at = now()
    WHERE current_stock <> 0;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('inventory_items_zeroed', v_count);
  ELSE
    v_result := v_result || jsonb_build_object('inventory_items_zeroed', 0);
  END IF;

  RETURN v_result || jsonb_build_object(
    'period_days', COALESCE(p_days, -1),
    'cutoff', COALESCE(v_cutoff::text, 'all'),
    'reset_at', now()
  );
END;
$$;