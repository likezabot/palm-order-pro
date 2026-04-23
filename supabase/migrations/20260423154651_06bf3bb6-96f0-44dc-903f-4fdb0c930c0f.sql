-- Trigger function: enfileira evento 'print_recovered' quando uma impressão conclui com sucesso
CREATE OR REPLACE FUNCTION public.queue_print_recovered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_state text;
BEGIN
  -- Só dispara em transições para 'printed' vindas de 'pending' ou 'printing'
  IF NEW.print_status = 'printed'
     AND OLD.print_status IN ('pending','printing')
     AND (NEW.print_last_error IS NULL OR NEW.print_last_error = '' OR NEW.print_last_error NOT LIKE '%cleared by admin%') THEN
    -- Lê estado atual da ponte
    SELECT (value::jsonb)->>'status' INTO v_state
    FROM public.settings
    WHERE key = 'printer_bridge_state';

    -- Só enfileira se estado salvo for 'offline'
    IF v_state = 'offline' THEN
      INSERT INTO public.notification_queue (event_type, entity_id, payload, consolidate_key, send_after)
      VALUES ('print_recovered', NEW.id,
        jsonb_build_object('table_name', NEW.table_name),
        'print_recovered:global',
        now() + interval '2 seconds')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_queue_print_recovered ON public.orders;
CREATE TRIGGER trg_queue_print_recovered
AFTER UPDATE OF print_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.queue_print_recovered();

-- Inicializa o estado da ponte como online
INSERT INTO public.settings (key, value)
VALUES ('printer_bridge_state', '{"status":"online","since":null,"alerted":false}')
ON CONFLICT (key) DO NOTHING;