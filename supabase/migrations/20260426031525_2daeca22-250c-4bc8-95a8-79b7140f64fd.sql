-- Update update_order_status to set served_at when moving to 'done'
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text;
  v_clean text;
BEGIN
  v_clean := lower(trim(coalesce(p_status,'')));
  IF v_clean NOT IN ('new','preparing','done','cancelled') THEN
    RAISE EXCEPTION 'invalid_status: %', p_status;
  END IF;

  SELECT status INTO v_current FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_current = 'paid' THEN RAISE EXCEPTION 'cannot_change_paid_order'; END IF;
  IF v_current = 'cancelled' AND v_clean <> 'cancelled' THEN
    RAISE EXCEPTION 'cannot_revive_cancelled_order';
  END IF;

  IF v_clean = 'done' THEN
    UPDATE public.orders 
    SET status = v_clean, 
        served_at = COALESCE(served_at, now()), 
        updated_at = now() 
    WHERE id = p_order_id;
  ELSIF v_clean = 'preparing' THEN
     -- Se voltar para preparando, limpamos o served_at (opcional, mas condiz com TableGrid)
     UPDATE public.orders 
     SET status = v_clean, 
         served_at = NULL, 
         updated_at = now() 
     WHERE id = p_order_id;
  ELSE
    UPDATE public.orders 
    SET status = v_clean, 
        updated_at = now() 
    WHERE id = p_order_id;
  END IF;
END;
$$;