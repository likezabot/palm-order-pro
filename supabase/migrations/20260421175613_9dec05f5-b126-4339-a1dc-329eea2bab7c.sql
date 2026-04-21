ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS served_at timestamptz;

CREATE OR REPLACE FUNCTION public.reset_served_at_on_new_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET served_at = NULL
  WHERE id = NEW.order_id AND served_at IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reset_served_at_on_new_items ON public.order_items;
CREATE TRIGGER reset_served_at_on_new_items
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.reset_served_at_on_new_items();