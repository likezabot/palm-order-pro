-- 1) Tabela print_jobs
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('order','extra','bill','manual')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','printing','printed','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text NULL,
  claimed_at timestamptz NULL,
  printed_at timestamptz NULL,
  payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS print_jobs_status_created_idx
  ON public.print_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS print_jobs_order_idx
  ON public.print_jobs (order_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_print_jobs_updated_at ON public.print_jobs;
CREATE TRIGGER trg_print_jobs_updated_at
BEFORE UPDATE ON public.print_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) RLS — segue o padrão das outras tabelas operacionais (acesso público controlado por RPC/serviço)
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS print_jobs_select ON public.print_jobs;
CREATE POLICY print_jobs_select ON public.print_jobs
FOR SELECT USING (true);

DROP POLICY IF EXISTS print_jobs_insert ON public.print_jobs;
CREATE POLICY print_jobs_insert ON public.print_jobs
FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS print_jobs_update ON public.print_jobs;
CREATE POLICY print_jobs_update ON public.print_jobs
FOR UPDATE USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;

-- 3) RPC: enqueue_print_job (helper centralizado)
CREATE OR REPLACE FUNCTION public.enqueue_print_job(
  p_order_id uuid,
  p_job_type text,
  p_payload jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_job_type NOT IN ('order','extra','bill','manual') THEN
    RAISE EXCEPTION 'invalid_job_type: %', p_job_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  INSERT INTO public.print_jobs (order_id, job_type, status, payload)
  VALUES (p_order_id, p_job_type, 'queued', p_payload)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 4) RPC: claim_print_job — pega o próximo job da fila
CREATE OR REPLACE FUNCTION public.claim_print_job()
RETURNS TABLE (
  id uuid,
  order_id uuid,
  job_type text,
  attempts int,
  payload jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.print_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job
  FROM public.print_jobs
  WHERE status = 'queued'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.print_jobs
  SET status = 'printing',
      attempts = v_job.attempts + 1,
      claimed_at = now(),
      updated_at = now()
  WHERE public.print_jobs.id = v_job.id;

  id := v_job.id;
  order_id := v_job.order_id;
  job_type := v_job.job_type;
  attempts := v_job.attempts + 1;
  payload := v_job.payload;
  created_at := v_job.created_at;
  RETURN NEXT;
END;
$$;

-- 5) RPC: complete_print_job
CREATE OR REPLACE FUNCTION public.complete_print_job(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.print_jobs
  SET status = 'printed',
      printed_at = now(),
      last_error = NULL,
      updated_at = now()
  WHERE id = p_id;
END;
$$;

-- 6) RPC: fail_print_job
CREATE OR REPLACE FUNCTION public.fail_print_job(
  p_id uuid,
  p_error text DEFAULT NULL,
  p_max_attempts int DEFAULT 5
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_attempts int;
BEGIN
  SELECT attempts INTO v_attempts FROM public.print_jobs WHERE id = p_id;
  IF v_attempts IS NULL THEN RETURN; END IF;

  IF v_attempts >= p_max_attempts THEN
    UPDATE public.print_jobs
    SET status = 'failed',
        last_error = p_error,
        claimed_at = NULL,
        updated_at = now()
    WHERE id = p_id;
  ELSE
    UPDATE public.print_jobs
    SET status = 'queued',
        last_error = p_error,
        claimed_at = NULL,
        updated_at = now()
    WHERE id = p_id;
  END IF;
END;
$$;

-- 7) RPC: requeue_stuck_print_jobs_v2 — devolve jobs travados em 'printing' há > N segundos
CREATE OR REPLACE FUNCTION public.requeue_stuck_print_jobs_v2(p_seconds int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF p_seconds IS NULL OR p_seconds < 5 THEN p_seconds := 10; END IF;

  WITH upd AS (
    UPDATE public.print_jobs
    SET status = 'queued',
        claimed_at = NULL,
        last_error = COALESCE(last_error, 'requeued by watchdog'),
        updated_at = now()
    WHERE status = 'printing'
      AND claimed_at IS NOT NULL
      AND claimed_at < now() - make_interval(secs => p_seconds)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN jsonb_build_object('requeued', v_count, 'threshold_seconds', p_seconds);
END;
$$;