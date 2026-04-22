-- Fase 2: triggers adicionais para notificações Telegram

-- 1. Falhas de impressão
CREATE OR REPLACE FUNCTION public.queue_print_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Disparou quando o worker volta de 'printing' para 'pending' com erro
  IF NEW.print_status = 'pending'
     AND OLD.print_status = 'printing'
     AND NEW.print_last_error IS NOT NULL
     AND NEW.print_last_error <> '' THEN
    INSERT INTO public.notification_queue (event_type, entity_id, payload, consolidate_key, send_after)
    VALUES ('print_failure', NEW.id,
      jsonb_build_object(
        'table_name', NEW.table_name,
        'print_type', NEW.print_type,
        'error', NEW.print_last_error
      ),
      'print_failure:' || NEW.id::text,
      now() + interval '10 seconds');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_print_failure ON public.orders;
CREATE TRIGGER trg_queue_print_failure
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.queue_print_failure();

-- 2. Mesa renomeada / movida
CREATE OR REPLACE FUNCTION public.queue_table_renamed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.table_name IS DISTINCT FROM OLD.table_name
     AND NEW.status IN ('new','preparing','done')
     AND OLD.status <> 'paid' THEN
    INSERT INTO public.notification_queue (event_type, entity_id, payload, consolidate_key, send_after)
    VALUES ('table_renamed', NEW.id,
      jsonb_build_object(
        'old_name', OLD.table_name,
        'new_name', NEW.table_name,
        'waiter_name', NEW.waiter_name
      ),
      'table_renamed:' || NEW.id::text,
      now() + interval '5 seconds');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_table_renamed ON public.orders;
CREATE TRIGGER trg_queue_table_renamed
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.queue_table_renamed();

-- 3. Entradas de estoque (consolidadas por item, janela 30s)
CREATE OR REPLACE FUNCTION public.queue_stock_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current numeric;
  v_name text;
  v_unit text;
BEGIN
  IF NEW.movement_type = 'in' AND NEW.quantity > 0 THEN
    SELECT current_stock, name, unit INTO v_current, v_name, v_unit
    FROM public.inventory_items WHERE id = NEW.item_id;

    IF v_name IS NULL THEN RETURN NEW; END IF;

    INSERT INTO public.notification_queue (event_type, entity_id, payload, consolidate_key, send_after)
    VALUES ('stock_in', NEW.item_id,
      jsonb_build_object(
        'name', v_name,
        'quantity', NEW.quantity,
        'current', v_current,
        'unit', v_unit,
        'note', NEW.note
      ),
      'stock_in:' || NEW.item_id::text,
      now() + interval '30 seconds');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_stock_in ON public.inventory_movements;
CREATE TRIGGER trg_queue_stock_in
AFTER INSERT ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.queue_stock_in();