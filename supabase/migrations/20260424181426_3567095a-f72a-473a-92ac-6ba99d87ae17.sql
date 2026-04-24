-- Sincroniza tabela legada `orders` com a nova fila `print_jobs`
-- para manter compatibilidade visual durante a transição.

CREATE OR REPLACE FUNCTION public.complete_print_job(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
BEGIN
  UPDATE public.print_jobs
  SET status = 'printed',
      printed_at = now(),
      last_error = NULL,
      updated_at = now()
  WHERE id = p_id
  RETURNING order_id INTO v_order_id;

  IF v_order_id IS NOT NULL THEN
    UPDATE public.orders
    SET print_status = 'printed',
        printed_at = now(),
        print_claimed_at = NULL,
        print_last_error = NULL,
        is_printed = true
    WHERE id = v_order_id
      AND print_status IN ('pending','printing','queued');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_print_job(p_id uuid, p_error text DEFAULT NULL, p_max_attempts integer DEFAULT 5)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_attempts int;
  v_order_id uuid;
  v_new_status text;
BEGIN
  UPDATE public.print_jobs
  SET attempts = attempts,
      last_error = COALESCE(p_error, last_error),
      status = CASE
        WHEN attempts >= COALESCE(p_max_attempts, 5) THEN 'failed'
        ELSE 'queued'
      END,
      claimed_at = NULL,
      updated_at = now()
  WHERE id = p_id
  RETURNING attempts, order_id, status INTO v_attempts, v_order_id, v_new_status;

  -- Atualiza legado para refletir
  IF v_order_id IS NOT NULL THEN
    IF v_new_status = 'failed' THEN
      UPDATE public.orders
      SET print_status = 'failed',
          print_claimed_at = NULL,
          print_last_error = COALESCE(p_error, print_last_error)
      WHERE id = v_order_id
        AND print_status IN ('pending','printing','queued');
    ELSE
      UPDATE public.orders
      SET print_status = 'pending',
          print_claimed_at = NULL,
          print_last_error = COALESCE(p_error, print_last_error)
      WHERE id = v_order_id
        AND print_status IN ('printing','queued');
    END IF;
  END IF;
END;
$function$;

-- Habilita realtime para print_jobs (caso ainda não esteja)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'print_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.print_jobs REPLICA IDENTITY FULL;