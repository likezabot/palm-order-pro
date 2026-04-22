CREATE TABLE IF NOT EXISTS public.telegram_user_bindings (
  telegram_user_id bigint PRIMARY KEY,
  waiter_name text NOT NULL,
  telegram_username text,
  bound_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_user_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service only bindings"
ON public.telegram_user_bindings
FOR ALL
USING (false)
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_telegram_bindings_waiter ON public.telegram_user_bindings (waiter_name);