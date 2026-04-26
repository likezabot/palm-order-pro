-- 1) Remover a versão antiga/duplicada de create_public_order
-- (mantém apenas a versão "nova": slug, name, phone, service_type, payment_method, change_for, address, items, note, client_request_id)
DROP FUNCTION IF EXISTS public.create_public_order(
  p_restaurant_slug text,
  p_service_type text,
  p_customer_phone text,
  p_customer_name text,
  p_address jsonb,
  p_items jsonb,
  p_payment_method text,
  p_change_for numeric,
  p_note text,
  p_client_request_id text
);

-- 2) Tabela de erros do sistema
CREATE TABLE IF NOT EXISTS public.error_log (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  code text,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS error_log_occurred_at_idx
  ON public.error_log (occurred_at DESC);

CREATE INDEX IF NOT EXISTS error_log_unresolved_idx
  ON public.error_log (occurred_at DESC) WHERE resolved = false;

ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "error_log_insert" ON public.error_log
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "error_log_select" ON public.error_log
  FOR SELECT TO public USING (true);

CREATE POLICY "error_log_update" ON public.error_log
  FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "error_log_delete" ON public.error_log
  FOR DELETE TO public USING (true);