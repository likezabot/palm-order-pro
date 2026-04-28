CREATE OR REPLACE FUNCTION public.requeue_stuck_print_jobs(p_seconds integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_requeued_printing int := 0;
  v_requeued_queued int := 0;
BEGIN
  -- 1. Recupera pedidos presos em 'printing' (processamento ativo que travou)
  WITH upd_printing AS (
    UPDATE public.orders
    SET print_status = 'pending',
        print_claimed_at = NULL,
        print_last_error = 'watchdog: recovered from stuck printing (>' || p_seconds || 's)'
    WHERE print_status = 'printing'
      AND (print_claimed_at IS NULL OR print_claimed_at < now() - make_interval(secs => p_seconds))
    RETURNING 1
  )
  SELECT count(*) INTO v_requeued_printing FROM upd_printing;

  -- 2. Recupera pedidos presos em 'queued' (enfileirados localmente mas o worker sumiu)
  -- Usamos um threshold maior (5 min) para dar tempo do worker local agir.
  WITH upd_queued AS (
    UPDATE public.orders
    SET print_status = 'pending',
        print_claimed_at = NULL,
        print_last_error = 'watchdog: recovered from stale queue (>300s)'
    WHERE print_status = 'queued'
      AND updated_at < now() - interval '5 minutes'
    RETURNING 1
  )
  SELECT count(*) INTO v_requeued_queued FROM upd_queued;

  IF (v_requeued_printing + v_requeued_queued) > 0 THEN
    INSERT INTO public.error_log (source, severity, message, context)
    VALUES (
      'watchdog', 
      'warn', 
      'Watchdog recuperou pedidos presos', 
      jsonb_build_object(
        'requeued_printing', v_requeued_printing,
        'requeued_queued', v_requeued_queued,
        'threshold_printing', p_seconds
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'requeued', v_requeued_printing + v_requeued_queued,
    'requeued_printing', v_requeued_printing,
    'requeued_queued', v_requeued_queued
  );
END;
$function$;