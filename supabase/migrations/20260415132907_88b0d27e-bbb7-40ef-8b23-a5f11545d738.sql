
-- Add print_type column
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS print_type text DEFAULT NULL;

-- Drop existing overloaded functions
DROP FUNCTION IF EXISTS public.update_order_items(uuid, numeric, jsonb);
DROP FUNCTION IF EXISTS public.update_order_items(uuid, numeric, jsonb, jsonb);

-- Recreate with print_type parameter
CREATE OR REPLACE FUNCTION public.update_order_items(
  p_order_id uuid,
  p_total numeric,
  p_items jsonb,
  p_delta_items jsonb DEFAULT NULL,
  p_print_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.orders
  SET total = p_total,
      updated_at = now(),
      printed_at = NULL,
      delta_items = p_delta_items,
      print_type = p_print_type
  WHERE id = p_order_id;

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal)
  SELECT
    p_order_id,
    CASE WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') != '' THEN (item->>'product_id')::UUID ELSE NULL END,
    item->>'product_name',
    (item->>'product_price')::NUMERIC,
    (item->>'quantity')::INTEGER,
    NULLIF(item->>'note', ''),
    (item->>'subtotal')::NUMERIC
  FROM jsonb_array_elements(p_items) AS item;
END;
$$;
