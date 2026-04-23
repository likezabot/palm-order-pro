-- 1) Novo RPC: marca o pedido como "queued" (entregue à fila local).
-- IMPORTANTE: NÃO atualiza updated_at de propósito, para não disparar
-- novamente o autoprint via realtime.
CREATE OR REPLACE FUNCTION public.defer_order_print(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.orders
  SET print_status = 'queued',
      print_claimed_at = NULL,
      print_last_error = 'bridge_offline_queued'
  WHERE id = p_order_id
    AND print_status IN ('pending','printing','queued');
END;
$$;

GRANT EXECUTE ON FUNCTION public.defer_order_print(uuid) TO public, anon, authenticated;

-- 2) complete_order_print: aceita também transição de 'queued' para 'printed'
-- (o worker local consegue completar jobs enfileirados).
CREATE OR REPLACE FUNCTION public.complete_order_print(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.orders
  SET print_status = 'printed',
      printed_at = now(),
      print_claimed_at = NULL,
      print_last_error = NULL
  WHERE id = p_order_id
    AND print_status IN ('pending','printing','queued');
END;
$$;

-- 3) Watchdog ignora pedidos 'queued' — eles estão na fila local, não presos.
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

-- Garante permissão para o watchdog (estava 401 nos logs)
GRANT EXECUTE ON FUNCTION public.requeue_stuck_print_jobs(integer) TO public, anon, authenticated;