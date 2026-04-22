CREATE TABLE IF NOT EXISTS public.telegram_undo_stack (
  token text PRIMARY KEY,
  chat_id bigint NOT NULL,
  table_name text NOT NULL,
  ops jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_undo_chat_created ON public.telegram_undo_stack (chat_id, created_at DESC);
ALTER TABLE public.telegram_undo_stack ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service writes undo" ON public.telegram_undo_stack FOR ALL USING (true) WITH CHECK (true);