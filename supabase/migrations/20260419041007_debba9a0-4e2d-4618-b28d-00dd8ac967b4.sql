-- 1) Backfill: pedidos antigos sem original_table_name recebem o table_name atual
UPDATE public.orders
SET original_table_name = table_name
WHERE original_table_name IS NULL;

-- 2) create_order: rejeita criação se a mesa física já tem pedido ativo
CREATE OR REPLACE FUNCTION public.create_order(
  p_table_name text,
  p_waiter_name text,
  p_total numeric,
  p_items jsonb,
  p_should_print boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_order record;
  v_print_status text;
  v_existing_id uuid;
  v_existing_name text;
BEGIN
  IF p_table_name IS NULL OR p_table_name = '' THEN
    RAISE EXCEPTION 'table_name is required';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items are required';
  END IF;

  -- Bloqueio: BALCÃO pode ter múltiplos pedidos simultâneos (uso por senha),
  -- mas mesas físicas (qualquer outro nome) não podem.
  IF p_table_name <> 'BALCÃO' THEN
    SELECT id, table_name INTO v_existing_id, v_existing_name
    FROM public.orders
    WHERE status IN ('new','preparing','done')
      AND (
        original_table_name = p_table_name
        OR (original_table_name IS NULL AND table_name = p_table_name)
      )
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'table_already_in_use:%:%', v_existing_id, v_existing_name;
    END IF;
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