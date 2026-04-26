-- ============================================================
-- REMOÇÃO TOTAL DO MÓDULO DE ESTOQUE
-- ============================================================

-- 1) Triggers em tabelas que vão CONTINUAR existindo (order_items)
DROP TRIGGER IF EXISTS trg_order_items_auto_inventory_ins ON public.order_items;
DROP TRIGGER IF EXISTS trg_order_items_auto_inventory_del ON public.order_items;
DROP TRIGGER IF EXISTS trg_order_items_auto_inventory_upd ON public.order_items;

-- 2) Remover tabelas de estoque do realtime (idempotente)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.inventory_items;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.inventory_movements;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- 3) Drop das funções de estoque (CASCADE remove triggers/dependências internas)
DROP FUNCTION IF EXISTS public.apply_inventory_movement(uuid, text, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.apply_inventory_movement(uuid, text, numeric, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.apply_inventory_movement CASCADE;
DROP FUNCTION IF EXISTS public.find_inventory_item_by_text(text) CASCADE;
DROP FUNCTION IF EXISTS public.auto_inventory_from_order_items() CASCADE;
DROP FUNCTION IF EXISTS public.queue_stock_alert() CASCADE;
DROP FUNCTION IF EXISTS public.queue_stock_in() CASCADE;
DROP FUNCTION IF EXISTS public.sync_inventory_category_from_product() CASCADE;
DROP FUNCTION IF EXISTS public.admin_upsert_inventory_item CASCADE;
DROP FUNCTION IF EXISTS public.admin_bulk_import_inventory CASCADE;
DROP FUNCTION IF EXISTS public.admin_set_recipe CASCADE;
DROP FUNCTION IF EXISTS public.admin_delete_recipe CASCADE;

-- 4) Drop das tabelas de estoque
DROP TABLE IF EXISTS public.product_recipes CASCADE;
DROP TABLE IF EXISTS public.inventory_movements CASCADE;
DROP TABLE IF EXISTS public.inventory_items CASCADE;
DROP TABLE IF EXISTS public.stock_movements CASCADE;

-- 5) Recriar preview_operational_data_period sem estoque
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
  v := v || jsonb_build_object('notification_queue',
    (SELECT count(*) FROM notification_queue WHERE NOT v_use_cutoff OR created_at >= v_cutoff));
  v := v || jsonb_build_object('notification_log',
    (SELECT count(*) FROM notification_log WHERE NOT v_use_cutoff OR sent_at >= v_cutoff));
  v := v || jsonb_build_object('telegram_chat_state',
    (SELECT count(*) FROM telegram_chat_state WHERE NOT v_use_cutoff OR updated_at >= v_cutoff));
  v := v || jsonb_build_object('telegram_undo_stack',
    (SELECT count(*) FROM telegram_undo_stack WHERE NOT v_use_cutoff OR created_at >= v_cutoff));
  RETURN v;
END;
$$;

-- 6) Recriar reset_operational_data_period sem estoque
-- Drop antes pra mudar a assinatura (parâmetro p_reset_stock removido)
DROP FUNCTION IF EXISTS public.reset_operational_data_period(int, boolean);
DROP FUNCTION IF EXISTS public.reset_operational_data_period(int);

CREATE OR REPLACE FUNCTION public.reset_operational_data_period(p_days int DEFAULT NULL)
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

  IF v_use_cutoff THEN
    DELETE FROM order_items oi USING orders o
    WHERE oi.order_id = o.id AND o.created_at >= v_cutoff;
  ELSE
    DELETE FROM order_items;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('order_items', v_count);

  IF v_use_cutoff THEN DELETE FROM orders WHERE created_at >= v_cutoff;
  ELSE DELETE FROM orders; END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('orders', v_count);

  IF v_use_cutoff THEN DELETE FROM cash_movements WHERE created_at >= v_cutoff;
  ELSE DELETE FROM cash_movements; END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cash_movements', v_count);

  IF v_use_cutoff THEN
    DELETE FROM cash_register WHERE COALESCE(opened_at, closed_at) >= v_cutoff;
  ELSE DELETE FROM cash_register; END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('cash_register', v_count);

  IF v_use_cutoff THEN DELETE FROM notification_queue WHERE created_at >= v_cutoff;
  ELSE DELETE FROM notification_queue; END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('notification_queue', v_count);

  IF v_use_cutoff THEN DELETE FROM notification_log WHERE sent_at >= v_cutoff;
  ELSE DELETE FROM notification_log; END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('notification_log', v_count);

  IF v_use_cutoff THEN DELETE FROM telegram_chat_state WHERE updated_at >= v_cutoff;
  ELSE DELETE FROM telegram_chat_state; END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('telegram_chat_state', v_count);

  IF v_use_cutoff THEN DELETE FROM telegram_undo_stack WHERE created_at >= v_cutoff;
  ELSE DELETE FROM telegram_undo_stack; END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result := v_result || jsonb_build_object('telegram_undo_stack', v_count);

  RETURN v_result || jsonb_build_object(
    'period_days', COALESCE(p_days, -1),
    'cutoff', COALESCE(v_cutoff::text, 'all'),
    'reset_at', now()
  );
END;
$$;

-- 7) Recriar archive_and_purge_old_data sem estoque
CREATE OR REPLACE FUNCTION public.archive_and_purge_old_data(p_days_keep integer DEFAULT 60, p_source text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz;
  v_archived_summary int := 0;
  v_archived_waiter int := 0;
  v_archived_product int := 0;
  v_deleted_items int := 0;
  v_deleted_orders int := 0;
  v_deleted_notif int := 0;
  v_deleted_cash int := 0;
  v_started timestamptz := clock_timestamp();
  v_idem text;
  v_result jsonb;
  v_existing jsonb;
BEGIN
  IF p_days_keep IS NULL OR p_days_keep < 1 THEN
    p_days_keep := 60;
  END IF;
  v_cutoff := now() - make_interval(days => p_days_keep);

  v_idem := coalesce(p_source,'manual') || ':' || p_days_keep::text || ':'
            || to_char(date_trunc('minute', now()), 'YYYY-MM-DD"T"HH24:MI');

  SELECT result INTO v_existing
  FROM public.data_retention_log
  WHERE idempotency_key = v_idem AND status = 'success'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_set(v_existing, '{idempotent_skip}', 'true'::jsonb, true);
  END IF;

  BEGIN
    WITH src AS (
      SELECT
        date(created_at AT TIME ZONE 'America/Sao_Paulo') AS d,
        count(*) AS oc,
        coalesce(sum(total),0) AS rev,
        coalesce(jsonb_object_agg(pm, amt) FILTER (WHERE pm IS NOT NULL), '{}'::jsonb) AS pb
      FROM (
        SELECT created_at, total,
               coalesce(payment_method,'desconhecido') AS pm,
               sum(coalesce(total,0)) OVER (PARTITION BY date(created_at AT TIME ZONE 'America/Sao_Paulo'), coalesce(payment_method,'desconhecido')) AS amt
        FROM public.orders
        WHERE status = 'paid' AND created_at < v_cutoff
      ) s
      GROUP BY date(created_at AT TIME ZONE 'America/Sao_Paulo')
    ),
    ins AS (
      INSERT INTO public.daily_sales_summary (date, orders_count, total_revenue, payment_breakdown, updated_at)
      SELECT d, oc, rev, pb, now() FROM src
      ON CONFLICT (date) DO UPDATE
        SET orders_count = EXCLUDED.orders_count,
            total_revenue = EXCLUDED.total_revenue,
            payment_breakdown = EXCLUDED.payment_breakdown,
            updated_at = now()
      RETURNING 1
    )
    SELECT count(*) INTO v_archived_summary FROM ins;

    WITH src AS (
      SELECT
        date(o.created_at AT TIME ZONE 'America/Sao_Paulo') AS d,
        coalesce(o.waiter_name,'(sem garçom)') AS wn,
        count(DISTINCT o.id) AS oc,
        coalesce(sum(o.total),0) AS rev,
        count(DISTINCT o.table_name) AS tc,
        coalesce(sum(oi.quantity),0)::int AS items
      FROM public.orders o
      LEFT JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.status = 'paid' AND o.created_at < v_cutoff
      GROUP BY 1, 2
    ),
    ins AS (
      INSERT INTO public.daily_waiter_stats (date, waiter_name, orders_count, items_count, revenue, tables_count, updated_at)
      SELECT d, wn, oc, items, rev, tc, now() FROM src
      ON CONFLICT (date, waiter_name) DO UPDATE
        SET orders_count = EXCLUDED.orders_count,
            items_count = EXCLUDED.items_count,
            revenue = EXCLUDED.revenue,
            tables_count = EXCLUDED.tables_count,
            updated_at = now()
      RETURNING 1
    )
    SELECT count(*) INTO v_archived_waiter FROM ins;

    WITH src AS (
      SELECT
        date(o.created_at AT TIME ZONE 'America/Sao_Paulo') AS d,
        oi.product_id,
        oi.product_name,
        coalesce(sum(oi.quantity),0)::numeric AS qty,
        coalesce(sum(oi.subtotal),0) AS rev
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.status = 'paid' AND o.created_at < v_cutoff
      GROUP BY 1, 2, 3
    ),
    ins AS (
      INSERT INTO public.daily_product_stats (date, product_id, product_name, quantity_sold, revenue, updated_at)
      SELECT d, product_id, product_name, qty, rev, now() FROM src
      ON CONFLICT (date, product_name) DO UPDATE
        SET product_id = EXCLUDED.product_id,
            quantity_sold = EXCLUDED.quantity_sold,
            revenue = EXCLUDED.revenue,
            updated_at = now()
      RETURNING 1
    )
    SELECT count(*) INTO v_archived_product FROM ins;

    WITH del AS (
      DELETE FROM public.order_items
      WHERE order_id IN (
        SELECT id FROM public.orders WHERE status = 'paid' AND created_at < v_cutoff
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_deleted_items FROM del;

    WITH del AS (
      DELETE FROM public.orders
      WHERE status = 'paid' AND created_at < v_cutoff
      RETURNING 1
    )
    SELECT count(*) INTO v_deleted_orders FROM del;

    WITH del AS (DELETE FROM public.notification_log WHERE sent_at < now() - interval '30 days' RETURNING 1)
    SELECT count(*) INTO v_deleted_notif FROM del;

    WITH del AS (
      DELETE FROM public.cash_movements cm
      USING public.cash_register cr
      WHERE cm.cash_register_id = cr.id
        AND cr.status = 'closed'
        AND cr.closed_at < now() - interval '90 days'
      RETURNING 1
    )
    SELECT count(*) INTO v_deleted_cash FROM del;

    v_result := jsonb_build_object(
      'days_kept', p_days_keep,
      'cutoff', v_cutoff,
      'archived_summary_days', v_archived_summary,
      'archived_waiter_rows', v_archived_waiter,
      'archived_product_rows', v_archived_product,
      'deleted_order_items', v_deleted_items,
      'deleted_orders', v_deleted_orders,
      'deleted_notification_log', v_deleted_notif,
      'deleted_cash_movements', v_deleted_cash
    );

    INSERT INTO public.data_retention_log
      (days_kept, trigger_source, status, result, duration_ms, idempotency_key)
    VALUES
      (p_days_keep, coalesce(p_source,'manual'), 'success', v_result,
       extract(milliseconds from clock_timestamp() - v_started)::int,
       v_idem)
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.data_retention_log
      (days_kept, trigger_source, status, result, duration_ms, idempotency_key, error_message)
    VALUES
      (p_days_keep, coalesce(p_source,'manual'), 'error', '{}'::jsonb,
       extract(milliseconds from clock_timestamp() - v_started)::int,
       v_idem || ':err:' || floor(random()*100000)::text,
       SQLERRM)
    ON CONFLICT (idempotency_key) DO NOTHING;
    RAISE;
  END;
END;
$function$;

-- 8) Auditoria
INSERT INTO public.error_log (source, severity, code, message, context)
VALUES (
  'migration',
  'info',
  'inventory_module_removed',
  'Módulo de estoque removido completamente (tabelas, funções, triggers, integrações).',
  jsonb_build_object(
    'dropped_tables', ARRAY['inventory_items','inventory_movements','product_recipes','stock_movements'],
    'dropped_functions', ARRAY['apply_inventory_movement','find_inventory_item_by_text','auto_inventory_from_order_items','queue_stock_alert','queue_stock_in','sync_inventory_category_from_product','admin_upsert_inventory_item','admin_bulk_import_inventory','admin_set_recipe','admin_delete_recipe'],
    'recreated_functions', ARRAY['preview_operational_data_period','reset_operational_data_period','archive_and_purge_old_data']
  )
);