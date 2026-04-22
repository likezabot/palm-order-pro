-- Fase 3: trigger de fechamento de caixa
CREATE OR REPLACE FUNCTION public.queue_cash_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sangrias numeric := 0;
  v_suprimentos numeric := 0;
  v_vendas numeric;
  v_esperado numeric;
  v_diferenca numeric;
BEGIN
  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
    SELECT COALESCE(SUM(CASE WHEN type IN ('sangria','withdrawal','out') THEN amount ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN type IN ('suprimento','supply','in') THEN amount ELSE 0 END), 0)
    INTO v_sangrias, v_suprimentos
    FROM public.cash_movements
    WHERE cash_register_id = NEW.id;

    v_vendas := COALESCE(NEW.total_sales, 0);
    v_esperado := COALESCE(NEW.initial_amount, 0) + v_vendas - v_sangrias + v_suprimentos;
    v_diferenca := COALESCE(NEW.final_amount, 0) - v_esperado;

    INSERT INTO public.notification_queue (event_type, entity_id, payload, consolidate_key, send_after)
    VALUES ('cash_closed', NEW.id,
      jsonb_build_object(
        'initial_amount', NEW.initial_amount,
        'total_sales', v_vendas,
        'sangrias', v_sangrias,
        'suprimentos', v_suprimentos,
        'esperado', v_esperado,
        'final_amount', NEW.final_amount,
        'diferenca', v_diferenca
      ),
      'cash_closed:' || NEW.id::text,
      now() + interval '5 seconds');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_cash_closed ON public.cash_register;
CREATE TRIGGER trg_queue_cash_closed
AFTER UPDATE ON public.cash_register
FOR EACH ROW
EXECUTE FUNCTION public.queue_cash_closed();