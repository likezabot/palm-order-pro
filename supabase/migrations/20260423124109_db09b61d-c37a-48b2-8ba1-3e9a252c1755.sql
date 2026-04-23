ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_products_aliases_gin
  ON public.products USING GIN (aliases);