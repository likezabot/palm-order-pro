-- Tabelas de histórico agregado
CREATE TABLE IF NOT EXISTS public.daily_sales_summary (
  date date PRIMARY KEY,
  orders_count int NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  payment_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_waiter_stats (
  date date NOT NULL,
  waiter_name text NOT NULL,
  orders_count int NOT NULL DEFAULT 0,
  items_count int NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  tables_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, waiter_name)
);

CREATE TABLE IF NOT EXISTS public.daily_product_stats (
  date date NOT NULL,
  product_id uuid NULL,
  product_name text NOT NULL,
  quantity_sold numeric NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, product_name)
);

ALTER TABLE public.daily_sales_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_waiter_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_product_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_sales_summary read" ON public.daily_sales_summary FOR SELECT USING (true);
CREATE POLICY "daily_waiter_stats read" ON public.daily_waiter_stats FOR SELECT USING (true);
CREATE POLICY "daily_product_stats read" ON public.daily_product_stats FOR SELECT USING (true);

-- Index para acelerar purge
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON public.orders(status, created_at);

-- Função de arquivamento + purge
CREATE OR REPLACE FUNCTION public.archive_and_purge_old_data(p_days_keep int DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  IF p_days_keep IS NULL OR p_days_keep < 1 THEN
    p_days_keep := 60;
  END IF;
  v_cutoff := now() - make_interval(days => p_days_keep);

  -- 1) Agrega summary diário (UPSERT idempotente)
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

  -- 2) Agrega por garçom
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

  -- 3) Agrega por produto
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
    SELECT d, product_id, product_name, qty, rev FROM src
    ON CONFLICT (date, product_name) DO UPDATE
      SET product_id = EXCLUDED.product_id,
          quantity_sold = EXCLUDED.quantity_sold,
          revenue = EXCLUDED.revenue,
          updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_archived_product FROM ins;

  -- 4) Apaga order_items dos pedidos arquivados
  WITH del AS (
    DELETE FROM public.order_items
    WHERE order_id IN (
      SELECT id FROM public.orders
      WHERE status = 'paid' AND created_at < v_cutoff
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted_items FROM del;

  -- 5) Apaga orders arquivados
  WITH del AS (
    DELETE FROM public.orders
    WHERE status = 'paid' AND created_at < v_cutoff
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted_orders FROM del;

  -- 6) Cleanup inventory_movements antigos (>90d)
  WITH del AS (
    DELETE FROM public.inventory_movements
    WHERE created_at < now() - interval '90 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted_inv FROM del;

  -- 7) Cleanup notification_log antigos (>30d)
  WITH del AS (
    DELETE FROM public.notification_log
    WHERE sent_at < now() - interval '30 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted_notif FROM del;

  -- 8) Cleanup stock_movements antigos (>90d)
  WITH del AS (
    DELETE FROM public.stock_movements
    WHERE created_at < now() - interval '90 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted_stock FROM del;

  -- 9) Cleanup cash_movements de caixas fechados há >90d
  WITH del AS (
    DELETE FROM public.cash_movements cm
    USING public.cash_register cr
    WHERE cm.cash_register_id = cr.id
      AND cr.status = 'closed'
      AND cr.closed_at < now() - interval '90 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted_cash FROM del;

  RETURN jsonb_build_object(
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
END;
$$;

-- Agendamento diário às 04:00 (BRT ~ 07:00 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('archive_and_purge_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'archive_and_purge_daily',
  '0 7 * * *',
  $$ SELECT public.archive_and_purge_old_data(60); $$
);