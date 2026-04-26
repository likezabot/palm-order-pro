-- Update pay_order to ensure served_at is set
CREATE OR REPLACE FUNCTION public.pay_order(
  p_order_id uuid,
  p_payment_method text,
  p_amount_paid numeric,
  p_should_print boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_real_total numeric;
  v_method text;
BEGIN
  v_method := lower(coalesce(p_payment_method, ''));
  IF v_method NOT IN ('cash','pix','card','credit','debit','none') THEN
    RAISE EXCEPTION 'invalid_payment_method: %', p_payment_method;
  END IF;
  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
    RAISE EXCEPTION 'invalid_amount_paid';
  END IF;

  -- Lock da linha do pedido (anti race + double-pay)
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_status = 'paid' THEN RAISE EXCEPTION 'order_already_paid'; END IF;

  -- Recalcula total real a partir dos itens
  SELECT COALESCE(SUM(subtotal), 0) INTO v_real_total
  FROM public.order_items WHERE order_id = p_order_id;

  IF v_real_total <= 0 THEN
    RAISE EXCEPTION 'order_has_no_items';
  END IF;

  -- Validação de valor pago
  IF v_method = 'cash' THEN
    IF p_amount_paid + 0.01 < v_real_total THEN
      RAISE EXCEPTION 'insufficient_cash: required % got %', v_real_total, p_amount_paid;
    END IF;
  ELSIF v_method = 'none' THEN
    -- 'none' = fechamento administrativo
  ELSE
    -- Outros métodos: Pix/Card (validação exata)
    IF ABS(p_amount_paid - v_real_total) > 0.01 THEN
      RAISE EXCEPTION 'amount_mismatch: required % got %', v_real_total, p_amount_paid;
    END IF;
  END IF;

  UPDATE public.orders
  SET status = 'paid',
      payment_method = v_method,
      amount_paid = p_amount_paid,
      total = v_real_total,
      served_at = COALESCE(served_at, now()),
      updated_at = now(),
      print_status = CASE WHEN p_should_print THEN 'pending' ELSE print_status END,
      print_type = CASE WHEN p_should_print THEN 'bill' ELSE print_type END,
      printed_at = CASE WHEN p_should_print THEN NULL ELSE printed_at END
  WHERE id = p_order_id;
END;
$$;