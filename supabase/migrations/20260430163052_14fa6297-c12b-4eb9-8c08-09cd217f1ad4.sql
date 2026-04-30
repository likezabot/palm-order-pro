CREATE OR REPLACE FUNCTION complete_order_print(p_order_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Atualiza o status do pedido
  UPDATE orders 
  SET print_status = 'printed', 
      printed_at = now() 
  WHERE id = p_order_id;

  -- Atualiza o status do job na fila (correção para badge visual)
  UPDATE print_jobs 
  SET status = 'printed', 
      updated_at = now() 
  WHERE order_id = p_order_id 
    AND status IN ('queued', 'printing');
END;
$$;