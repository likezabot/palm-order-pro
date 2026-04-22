-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fila de notificações (consolidação confiável em DB)
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL, -- 'order_created' | 'order_item_added' | 'order_item_removed' | 'order_paid' | 'stock_critical' | 'stock_zero'
  entity_id uuid NOT NULL,  -- order_id ou inventory_item_id
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  consolidate_key text NOT NULL, -- chave de agrupamento (ex: "order_delta:<order_id>")
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  send_after timestamptz NOT NULL DEFAULT (now() + interval '8 seconds') -- janela de consolidação
);
CREATE INDEX IF NOT EXISTS idx_notif_queue_pending ON public.notification_queue (send_after) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notif_queue_consolidate ON public.notification_queue (consolidate_key) WHERE processed_at IS NULL;

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only queue" ON public.notification_queue FOR ALL USING (false) WITH CHECK (false);

-- Log de envios (idempotência)
CREATE TABLE IF NOT EXISTS public.notification_log (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  entity_id uuid NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_log_sent_at ON public.notification_log (sent_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only log" ON public.notification_log FOR ALL USING (false) WITH CHECK (false);

-- Padronização de nome de garçom (para ranking)
CREATE OR REPLACE FUNCTION public.normalize_waiter_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(translate(coalesce(p_name,''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')));
$$;

-- Trigger: novo pedido
CREATE OR REPLACE FUNCTION public.queue_order_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('new','preparing','done') THEN
    INSERT INTO public.notification_queue (event_type, entity_id, payload, consolidate_key, send_after)
    VALUES ('order_created', NEW.id,
      jsonb_build_object('table_name', NEW.table_name, 'waiter_name', NEW.waiter_name, 'total', NEW.total),
      'order_created:' || NEW.id::text,
      now() + interval '5 seconds');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_queue_order_created ON public.orders;
CREATE TRIGGER trg_queue_order_created AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.queue_order_created();

-- Trigger: pedido pago / atualizado (delta)
CREATE OR REPLACE FUNCTION public.queue_order_updated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Pago
  IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
    INSERT INTO public.notification_queue (event_type, entity_id, payload, consolidate_key, send_after)
    VALUES ('order_paid', NEW.id,
      jsonb_build_object('table_name', NEW.table_name, 'waiter_name', NEW.waiter_name,
                         'total', NEW.total, 'amount_paid', NEW.amount_paid, 'payment_method', NEW.payment_method),
      'order_paid:' || NEW.id::text,
      now() + interval '2 seconds');
  END IF;

  -- Acréscimo/remoção via delta_items (consolida pela mesa)
  IF NEW.delta_items IS NOT NULL AND NEW.delta_items <> COALESCE(OLD.delta_items, '[]'::jsonb)
     AND NEW.status IN ('new','preparing','done') AND OLD.status <> 'paid' THEN
    INSERT INTO public.notification_queue (event_type, entity_id, payload, consolidate_key, send_after)
    VALUES ('order_delta', NEW.id,
      jsonb_build_object('table_name', NEW.table_name, 'waiter_name', NEW.waiter_name,
                         'total', NEW.total, 'delta', NEW.delta_items, 'print_type', NEW.print_type),
      'order_delta:' || NEW.id::text,
      now() + interval '8 seconds');
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_queue_order_updated ON public.orders;
CREATE TRIGGER trg_queue_order_updated AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.queue_order_updated();

-- Trigger: estoque crítico/zerado
CREATE OR REPLACE FUNCTION public.queue_stock_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event text;
BEGIN
  IF NEW.movement_type = 'out' OR (NEW.movement_type = 'adjustment') THEN
    -- Lê estoque atual após o movimento
    DECLARE
      v_current numeric;
      v_min numeric;
      v_name text;
      v_unit text;
    BEGIN
      SELECT current_stock, min_stock, name, unit INTO v_current, v_min, v_name, v_unit
      FROM public.inventory_items WHERE id = NEW.item_id;

      IF v_current IS NULL THEN RETURN NEW; END IF;

      IF v_current <= 0 THEN
        v_event := 'stock_zero';
      ELSIF v_min > 0 AND v_current <= v_min THEN
        v_event := 'stock_critical';
      ELSE
        RETURN NEW;
      END IF;

      INSERT INTO public.notification_queue (event_type, entity_id, payload, consolidate_key, send_after)
      VALUES (v_event, NEW.item_id,
        jsonb_build_object('name', v_name, 'current', v_current, 'min', v_min, 'unit', v_unit),
        v_event || ':' || NEW.item_id::text,
        now() + interval '3 seconds')
      ON CONFLICT DO NOTHING;
    END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_queue_stock_alert ON public.inventory_movements;
CREATE TRIGGER trg_queue_stock_alert AFTER INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.queue_stock_alert();

-- Cron: drena fila a cada 30s
SELECT cron.schedule(
  'drain-notification-queue',
  '*/1 * * * *',
  $cron$
  SELECT net.http_post(
    url:='https://gbpcjjtxqtzqotmkfxrh.supabase.co/functions/v1/notify-telegram',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdicGNqanR4cXR6cW90bWtmeHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTE0OTIsImV4cCI6MjA5MTcyNzQ5Mn0.K82zsqXu_airg_b3GYtKQ2vk7r5hYj_nYrt3AcmurD8"}'::jsonb,
    body:='{"action":"drain"}'::jsonb
  );
  $cron$
);

-- Cron: relatório diário às 00:00 BRT (03:00 UTC)
SELECT cron.schedule(
  'daily-waiter-report',
  '0 3 * * *',
  $cron$
  SELECT net.http_post(
    url:='https://gbpcjjtxqtzqotmkfxrh.supabase.co/functions/v1/daily-waiter-report',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdicGNqanR4cXR6cW90bWtmeHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTE0OTIsImV4cCI6MjA5MTcyNzQ5Mn0.K82zsqXu_airg_b3GYtKQ2vk7r5hYj_nYrt3AcmurD8"}'::jsonb,
    body:='{}'::jsonb
  );
  $cron$
);