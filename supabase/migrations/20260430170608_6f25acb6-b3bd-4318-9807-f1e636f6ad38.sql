-- Remove the role check and allow anon/authenticated access to complete_order_print
CREATE OR REPLACE FUNCTION public.complete_order_print(p_order_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- We remove the auth.role() check to allow the bridge/desktop app 
  -- to complete the print even if not explicitly logged in to the web app.
  
  -- Atualiza o status do pedido
  UPDATE orders 
  SET print_status = 'printed', 
      printed_at = now(),
      print_claimed_at = NULL,
      print_last_error = NULL
  WHERE id = p_order_id;

  -- Atualiza o status do job na fila (correção para badge visual)
  UPDATE print_jobs 
  SET status = 'printed', 
      updated_at = now() 
  WHERE order_id = p_order_id 
    AND status IN ('queued', 'printing');
END;
$$;

-- Grant execute to the necessary roles
GRANT EXECUTE ON FUNCTION public.complete_order_print(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order_print(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.complete_order_print(UUID) TO service_role;
