CREATE OR REPLACE FUNCTION public.preview_operational_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb := '{}'::jsonb;
BEGIN
  v := v || jsonb_build_object('order_items', (SELECT count(*) FROM order_items));
  v := v || jsonb_build_object('orders', (SELECT count(*) FROM orders));
  v := v || jsonb_build_object('cash_movements', (SELECT count(*) FROM cash_movements));
  v := v || jsonb_build_object('cash_register', (SELECT count(*) FROM cash_register));
  v := v || jsonb_build_object('inventory_movements', (SELECT count(*) FROM inventory_movements));
  v := v || jsonb_build_object('stock_movements', (SELECT count(*) FROM stock_movements));
  v := v || jsonb_build_object('notification_queue', (SELECT count(*) FROM notification_queue));
  v := v || jsonb_build_object('notification_log', (SELECT count(*) FROM notification_log));
  v := v || jsonb_build_object('telegram_chat_state', (SELECT count(*) FROM telegram_chat_state));
  v := v || jsonb_build_object('telegram_undo_stack', (SELECT count(*) FROM telegram_undo_stack));
  v := v || jsonb_build_object('data_retention_log', (SELECT count(*) FROM data_retention_log));
  v := v || jsonb_build_object('pin_attempt_log', (SELECT count(*) FROM pin_attempt_log));
  v := v || jsonb_build_object('inventory_items_with_stock',
    (SELECT count(*) FROM inventory_items WHERE current_stock <> 0));
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_operational_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_count int;
BEGIN
  DELETE FROM order_items; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_items', v_count);

  DELETE FROM orders; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders', v_count);

  DELETE FROM cash_movements; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cash_movements', v_count);

  DELETE FROM cash_register; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cash_register', v_count);

  DELETE FROM inventory_movements; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('inventory_movements', v_count);

  DELETE FROM stock_movements; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('stock_movements', v_count);

  DELETE FROM notification_queue; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('notification_queue', v_count);

  DELETE FROM notification_log; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('notification_log', v_count);

  DELETE FROM telegram_chat_state; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('telegram_chat_state', v_count);

  DELETE FROM telegram_undo_stack; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('telegram_undo_stack', v_count);

  DELETE FROM data_retention_log; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('data_retention_log', v_count);

  DELETE FROM pin_attempt_log; GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('pin_attempt_log', v_count);

  UPDATE inventory_items SET current_stock = 0, updated_at = now()
  WHERE current_stock <> 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('inventory_items_zeroed', v_count);

  RETURN v_result || jsonb_build_object('reset_at', now());
END;
$$;