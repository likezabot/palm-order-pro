
CREATE OR REPLACE FUNCTION public.update_order_items(
  p_order_id UUID,
  p_total NUMERIC,
  p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update order total
  UPDATE public.orders
  SET total = p_total, updated_at = now()
  WHERE id = p_order_id;

  -- Delete old items
  DELETE FROM public.order_items WHERE order_id = p_order_id;

  -- Insert new items from JSONB array
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
