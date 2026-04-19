CREATE OR REPLACE FUNCTION public.merge_table_duplicates(p_table_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_primary_id uuid;
  v_duplicate_ids uuid[];
  v_merged_count integer := 0;
  v_total numeric;
BEGIN
  IF p_table_name IS NULL OR trim(p_table_name) = '' THEN
    RAISE EXCEPTION 'table_name_required';
  END IF;

  IF p_table_name = 'BALCÃO' THEN
    RAISE EXCEPTION 'cannot_merge_balcao';
  END IF;

  -- Lock + escolhe o pedido mais antigo como principal.
  SELECT array_agg(id ORDER BY created_at ASC) INTO v_duplicate_ids
  FROM public.orders
  WHERE status IN ('new','preparing','done')
    AND (
      original_table_name = p_table_name
      OR (original_table_name IS NULL AND table_name = p_table_name)
    )
  FOR UPDATE;

  IF v_duplicate_ids IS NULL OR array_length(v_duplicate_ids, 1) < 2 THEN
    RETURN jsonb_build_object('merged', 0, 'primary_id', NULL);
  END IF;

  v_primary_id := v_duplicate_ids[1];
  v_merged_count := array_length(v_duplicate_ids, 1) - 1;

  -- Move todos os itens dos pedidos duplicados para o principal
  UPDATE public.order_items
  SET order_id = v_primary_id
  WHERE order_id = ANY(v_duplicate_ids[2:array_length(v_duplicate_ids,1)]);

  -- Consolida itens iguais (mesmo product_id/name/note) somando quantidades
  WITH consolidated AS (
    SELECT
      MIN(id) AS keep_id,
      product_id,
      product_name,
      product_price,
      COALESCE(note, '') AS note_key,
      SUM(quantity) AS total_qty,
      SUM(subtotal) AS total_sub,
      array_agg(id) AS all_ids
    FROM public.order_items
    WHERE order_id = v_primary_id
    GROUP BY product_id, product_name, product_price, COALESCE(note, '')
  ),
  updated_keepers AS (
    UPDATE public.order_items oi
    SET quantity = c.total_qty,
        subtotal = c.total_sub
    FROM consolidated c
    WHERE oi.id = c.keep_id
    RETURNING oi.id
  )
  DELETE FROM public.order_items
  WHERE id IN (
    SELECT unnest(all_ids) FROM consolidated
    WHERE array_length(all_ids, 1) > 1
  )
  AND id NOT IN (SELECT id FROM updated_keepers);

  -- Recalcula total do pedido principal
  SELECT COALESCE(SUM(subtotal), 0) INTO v_total
  FROM public.order_items
  WHERE order_id = v_primary_id;

  UPDATE public.orders
  SET total = v_total,
      updated_at = now(),
      version = version + 1,
      print_status = 'pending',
      print_type = 'full',
      printed_at = NULL,
      print_claimed_at = NULL,
      print_last_error = NULL,
      delta_items = NULL
  WHERE id = v_primary_id;

  -- Apaga os pedidos extras (já sem itens)
  DELETE FROM public.orders
  WHERE id = ANY(v_duplicate_ids[2:array_length(v_duplicate_ids,1)]);

  RETURN jsonb_build_object(
    'merged', v_merged_count,
    'primary_id', v_primary_id,
    'total', v_total
  );
END;
$function$;