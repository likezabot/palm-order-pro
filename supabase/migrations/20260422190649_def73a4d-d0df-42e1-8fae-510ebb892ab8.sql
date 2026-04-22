CREATE TABLE IF NOT EXISTS public.telegram_chat_state (
  chat_id bigint PRIMARY KEY,
  step text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_chat_state_expires ON public.telegram_chat_state(expires_at);

ALTER TABLE public.telegram_chat_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service only chat state"
  ON public.telegram_chat_state
  FOR ALL
  USING (false)
  WITH CHECK (false);