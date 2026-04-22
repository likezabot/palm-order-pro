-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Index para acelerar worker e watchdog
CREATE INDEX IF NOT EXISTS idx_orders_print_status
  ON public.orders(print_status)
  WHERE print_status IN ('pending','printing');

-- Watchdog: limpa órfãos
CREATE OR REPLACE FUNCTION public.recover_stuck_prints()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reverted int := 0;
  v_auto_done int := 0;
  v_queue_cleaned int := 0;
BEGIN
  -- 1) Reverte 'printing' antigos (>2min sem confirmação) para 'pending'
  WITH upd AS (
    UPDATE public.orders
    SET print_status = 'pending',
        print_claimed_at = NULL,
        print_last_error = COALESCE(print_last_error, 'timeout (watchdog)')
    WHERE print_status = 'printing'
      AND print_claimed_at IS NOT NULL
      AND print_claimed_at < now() - interval '2 minutes'
    RETURNING 1
  )
  SELECT count(*) INTO v_reverted FROM upd;

  -- 2) Auto-cancela impressão de pedidos pagos com pending há >2h
  WITH upd AS (
    UPDATE public.orders
    SET print_status = 'printed',
        printed_at = COALESCE(printed_at, now()),
        print_last_error = COALESCE(print_last_error, 'auto-resolved (watchdog: paid >2h)')
    WHERE print_status = 'pending'
      AND status = 'paid'
      AND updated_at < now() - interval '2 hours'
    RETURNING 1
  )
  SELECT count(*) INTO v_auto_done FROM upd;

  -- 3) Cleanup notification_queue processada antiga (>7d)
  WITH del AS (
    DELETE FROM public.notification_queue
    WHERE processed_at IS NOT NULL
      AND processed_at < now() - interval '7 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_queue_cleaned FROM del;

  RETURN jsonb_build_object(
    'reverted_printing', v_reverted,
    'auto_marked_printed', v_auto_done,
    'queue_cleaned', v_queue_cleaned
  );
END;
$$;

-- Botão admin: força limpeza de órfãos pagos pendentes
CREATE OR REPLACE FUNCTION public.force_clear_orphan_prints()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cleared int := 0;
BEGIN
  WITH upd AS (
    UPDATE public.orders
    SET print_status = 'printed',
        printed_at = COALESCE(printed_at, now()),
        print_claimed_at = NULL,
        print_last_error = 'cleared by admin'
    WHERE print_status IN ('pending','printing')
      AND status = 'paid'
    RETURNING 1
  )
  SELECT count(*) INTO v_cleared FROM upd;

  RETURN jsonb_build_object('cleared', v_cleared);
END;
$$;

-- Agendamento (a cada minuto)
DO $$
BEGIN
  PERFORM cron.unschedule('recover_stuck_prints_every_minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'recover_stuck_prints_every_minute',
  '* * * * *',
  $$ SELECT public.recover_stuck_prints(); $$
);