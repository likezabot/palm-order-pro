ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_sold_out_online boolean NOT NULL DEFAULT false;