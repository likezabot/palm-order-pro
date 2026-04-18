CREATE OR REPLACE FUNCTION public.rename_order_table(p_order_id uuid, p_new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_clean text;
BEGIN
  v_clean := trim(p_new_name);
  IF v_clean IS NULL OR v_clean = '' THEN
    RAISE EXCEPTION 'table_name_required';
  END IF;

  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'cannot_rename_paid_order';
  END IF;

  UPDATE public.orders
  SET table_name = v_clean,
      updated_at = now()
  WHERE id = p_order_id;
END;
$function$;