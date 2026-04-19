CREATE OR REPLACE FUNCTION public.move_order_to_table(p_order_id uuid, p_target_table text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_clean text;
  v_existing_id uuid;
  v_existing_name text;
BEGIN
  v_clean := trim(p_target_table);
  IF v_clean IS NULL OR v_clean = '' THEN
    RAISE EXCEPTION 'target_table_required';
  END IF;

  IF v_clean = 'BALCÃO' THEN
    RAISE EXCEPTION 'cannot_move_to_balcao';
  END IF;

  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'cannot_move_paid_order';
  END IF;

  -- Verifica se a mesa destino já está em uso por OUTRO pedido ativo
  SELECT id, table_name INTO v_existing_id, v_existing_name
  FROM public.orders
  WHERE id <> p_order_id
    AND status IN ('new','preparing','done')
    AND (
      original_table_name = v_clean
      OR (original_table_name IS NULL AND table_name = v_clean)
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'target_table_occupied:%:%', v_existing_id, v_existing_name;
  END IF;

  UPDATE public.orders
  SET table_name = v_clean,
      original_table_name = v_clean,
      updated_at = now()
  WHERE id = p_order_id;
END;
$function$;