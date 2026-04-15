-- Add delta_items column
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delta_items jsonb;

-- Recreate RPC with p_delta_items parameter
CREATE OR REPLACE FUNCTION public.update_order_items(p_order_id uuid, p_total numeric, p_items jsonb, p_delta_items jsonb DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update order total, save delta, and reset printed_at so auto-print can re-trigger
  UPDATE public.orders
  SET total = p_total, updated_at = now(), printed_at = NULL, delta_items = p_delta_items
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
$function$;
