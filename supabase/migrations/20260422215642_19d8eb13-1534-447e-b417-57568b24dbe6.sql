-- Watchdog de impressão: devolve para 'pending' jobs que ficaram presos em 'printing'
-- (status que o claim_order_print usa) por mais de N segundos.
-- Idempotente, sem efeito se nada estiver preso.

CREATE OR REPLACE FUNCTION public.requeue_stuck_print_jobs(p_seconds integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requeued int := 0;
BEGIN
  IF p_seconds IS NULL OR p_seconds < 10 THEN
    p_seconds := 90;
  END IF;

  WITH upd AS (
    UPDATE public.orders
    SET print_status = 'pending',
        print_claimed_at = NULL,
        print_last_error = COALESCE(print_last_error, 'requeued by watchdog (stuck > ' || p_seconds || 's)')
    WHERE print_status = 'printing'
      AND print_claimed_at IS NOT NULL
      AND print_claimed_at < now() - make_interval(secs => p_seconds)
    RETURNING 1
  )
  SELECT count(*) INTO v_requeued FROM upd;

  RETURN jsonb_build_object('requeued', v_requeued, 'threshold_seconds', p_seconds);
END;
$$;

-- Index para acelerar o scan do watchdog
CREATE INDEX IF NOT EXISTS idx_orders_print_status_claimed
  ON public.orders (print_status, print_claimed_at)
  WHERE print_status = 'printing';