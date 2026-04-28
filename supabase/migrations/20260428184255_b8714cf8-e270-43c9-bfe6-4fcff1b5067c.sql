-- Update loyalty_transactions kind constraint
ALTER TABLE public.loyalty_transactions DROP CONSTRAINT IF EXISTS loyalty_transactions_kind_check;
ALTER TABLE public.loyalty_transactions ADD CONSTRAINT loyalty_transactions_kind_check 
CHECK (kind = ANY (ARRAY['earn'::text, 'redeem'::text, 'refund'::text, 'reversal'::text, 'admin_adjust'::text, 'redeem_reversal'::text]));

-- Drop overloaded RPCs to avoid confusion
DROP FUNCTION IF EXISTS public.update_order_status(uuid, text);
DROP FUNCTION IF EXISTS public.update_order_status(uuid, text, text);

-- Recreate single unified RPC
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_status text,
  p_rejected_reason text DEFAULT NULL
)
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
  
  -- Validar status permitidos
  IF v_clean NOT IN ('new','preparing','done','cancelled') THEN
    RAISE EXCEPTION 'invalid_status: %', p_status;
  END IF;

  -- Bloquear e obter status atual
  SELECT status INTO v_current FROM public.orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_current IS NULL THEN 
    RAISE EXCEPTION 'order_not_found'; 
  END IF;
  
  -- Não permite alterar pedidos já pagos (exceto se for para o mesmo status, o que é no-op)
  IF v_current = 'paid' AND v_clean <> 'paid' THEN 
    RAISE EXCEPTION 'cannot_change_paid_order'; 
  END IF;
  
  -- Não permite "reviver" pedido cancelado
  IF v_current = 'cancelled' AND v_clean <> 'cancelled' THEN
    RAISE EXCEPTION 'cannot_revive_cancelled_order';
  END IF;

  -- Atualizar conforme o novo status
  IF v_clean = 'done' THEN
    UPDATE public.orders 
    SET status = v_clean, 
        served_at = COALESCE(served_at, now()), 
        rejected_reason = COALESCE(p_rejected_reason, rejected_reason),
        updated_at = now() 
    WHERE id = p_order_id;
  ELSIF v_clean = 'preparing' THEN
     UPDATE public.orders 
     SET status = v_clean, 
         served_at = NULL, 
         rejected_reason = COALESCE(p_rejected_reason, rejected_reason),
         updated_at = now() 
    WHERE id = p_order_id;
  ELSE
    -- Para 'new' ou 'cancelled'
    UPDATE public.orders 
    SET status = v_clean, 
        rejected_reason = COALESCE(p_rejected_reason, rejected_reason),
        updated_at = now() 
    WHERE id = p_order_id;
  END IF;
END;
$$;