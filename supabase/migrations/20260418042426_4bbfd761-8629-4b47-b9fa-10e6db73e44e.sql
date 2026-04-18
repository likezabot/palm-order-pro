ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS original_table_name text;
UPDATE public.orders SET original_table_name = table_name WHERE original_table_name IS NULL;

-- Atualizar create_order para preencher original_table_name = table_name
CREATE OR REPLACE FUNCTION public.create_order(p_table_name text, p_waiter_name text, p_total numeric, p_items jsonb, p_should_print boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_order record;
  v_print_status text;
BEGIN
  IF p_table_name IS NULL OR p_table_name = '' THEN
    RAISE EXCEPTION 'table_name is required';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items are required';
  END IF;

  v_print_status := CASE WHEN p_should_print THEN 'pending' ELSE 'printed' END;

  INSERT INTO public.orders (table_name, original_table_name, waiter_name, total, status, print_status, version)
  VALUES (p_table_name, p_table_name, NULLIF(p_waiter_name, ''), p_total, 'new', v_print_status, 1)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, note, subtotal)
  SELECT
    v_order_id,
    CASE WHEN (item->>'product_id') IS NOT NULL AND (item->>'product_id') != '' THEN (item->>'product_id')::UUID ELSE NULL END,
    item->>'product_name',
    (item->>'product_price')::NUMERIC,
    COALESCE((item->>'quantity')::INTEGER, 1),
    NULLIF(item->>'note', ''),
    (item->>'subtotal')::NUMERIC
  FROM jsonb_array_elements(p_items) AS item;

  SELECT id, created_at INTO v_order FROM public.orders WHERE id = v_order_id;
  RETURN jsonb_build_object('id', v_order_id, 'created_at', v_order.created_at);
END;
$function$;

-- rename_order_table NÃO altera original_table_name (mantém vínculo com mesa física)
-- a função existente já só atualiza table_name, então está correta.