CREATE OR REPLACE FUNCTION public.complete_order_print(p_order_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atualiza orders.print_status
  UPDATE public.orders
  SET print_status = 'printed',
      printed_at = now(),
      print_last_error = NULL
  WHERE id = p_order_id;

  -- Atualiza print_jobs.status (resolve o bug do badge "NA FILA")
  UPDATE public.print_jobs
  SET status = 'printed',
      printed_at = now(),
      updated_at = now()
  WHERE order_id = p_order_id
    AND status IN ('queued', 'printing');
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_order_print(UUID) TO anon, authenticated;