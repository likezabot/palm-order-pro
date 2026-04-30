-- Revoke execute from public to start with a secure default
REVOKE EXECUTE ON FUNCTION complete_order_print(UUID) FROM public;

-- Hardened version of the function
CREATE OR REPLACE FUNCTION complete_order_print(p_order_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- Verificar se o usuário está autenticado
  IF auth.role() IS NULL OR auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Atualiza o status do pedido
  UPDATE orders 
  SET print_status = 'printed', 
      printed_at = now() 
  WHERE id = p_order_id;

  -- Se o pedido não existir, saímos (ou poderíamos lançar exceção)
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Atualiza o status do job na fila (correção para badge visual)
  UPDATE print_jobs 
  SET status = 'printed', 
      updated_at = now() 
  WHERE order_id = p_order_id 
    AND status IN ('queued', 'printing');
END;
$$;

-- Grant execute only to authenticated users and service_role
GRANT EXECUTE ON FUNCTION complete_order_print(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_order_print(UUID) TO service_role;