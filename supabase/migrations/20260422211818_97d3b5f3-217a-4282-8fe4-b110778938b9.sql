-- 1) Tabela de log de retenção
CREATE TABLE IF NOT EXISTS public.data_retention_log (
  id BIGSERIAL PRIMARY KEY,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  days_kept INTEGER NOT NULL,
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'success',
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  duration_ms INTEGER,
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_data_retention_log_executed_at
  ON public.data_retention_log (executed_at DESC);

ALTER TABLE public.data_retention_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_retention_log read"
  ON public.data_retention_log
  FOR SELECT
  USING (true);

-- (sem políticas de insert/update/delete: só funções SECURITY DEFINER escrevem)

-- 2) Atualiza a função para auditar e ser idempotente por minuto+source
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
  v_deleted_inv int := 0;
  v_deleted_notif int := 0;
  v_deleted_stock int := 0;
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

  -- Idempotência por minuto + source + days_keep
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
    -- 1) Summary diário
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

    -- 2) Por garçom
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

    -- 3) Por produto
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

    -- 4) Apaga order_items
    WITH del AS (
      DELETE FROM public.order_items
      WHERE order_id IN (
        SELECT id FROM public.orders
        WHERE status = 'paid' AND created_at < v_cutoff
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_deleted_items FROM del;

    -- 5) Apaga orders
    WITH del AS (
      DELETE FROM public.orders
      WHERE status = 'paid' AND created_at < v_cutoff
      RETURNING 1
    )
    SELECT count(*) INTO v_deleted_orders FROM del;

    -- 6-9) Cleanups auxiliares
    WITH del AS (DELETE FROM public.inventory_movements WHERE created_at < now() - interval '90 days' RETURNING 1)
    SELECT count(*) INTO v_deleted_inv FROM del;

    WITH del AS (DELETE FROM public.notification_log WHERE sent_at < now() - interval '30 days' RETURNING 1)
    SELECT count(*) INTO v_deleted_notif FROM del;

    WITH del AS (DELETE FROM public.stock_movements WHERE created_at < now() - interval '90 days' RETURNING 1)
    SELECT count(*) INTO v_deleted_stock FROM del;

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
      'deleted_inventory_movements', v_deleted_inv,
      'deleted_notification_log', v_deleted_notif,
      'deleted_stock_movements', v_deleted_stock,
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
      (days_kept, trigger_source, status, result, error_message, duration_ms, idempotency_key)
    VALUES
      (p_days_keep, coalesce(p_source,'manual'), 'error',
       jsonb_build_object('cutoff', v_cutoff),
       SQLERRM,
       extract(milliseconds from clock_timestamp() - v_started)::int,
       v_idem || ':err:' || floor(extract(epoch from clock_timestamp()))::text)
    ON CONFLICT (idempotency_key) DO NOTHING;
    RAISE;
  END;
END;
$function$;

-- 3) Reagenda o cron passando source='cron' (se o job existir)
DO $$
BEGIN
  PERFORM cron.unschedule('archive_and_purge_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'archive_and_purge_daily',
  '0 4 * * *',
  $$ SELECT public.archive_and_purge_old_data(60, 'cron'); $$
);