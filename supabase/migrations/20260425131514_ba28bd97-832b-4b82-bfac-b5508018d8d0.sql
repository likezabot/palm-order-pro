-- 1) Atualiza get_public_order_status para incluir served_at e updated_at (timeline)
CREATE OR REPLACE FUNCTION public.get_public_order_status(p_order_id uuid, p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row record;
BEGIN
  SELECT id, status, total, delivery_fee, service_type, customer_name_snapshot,
         estimated_ready_at, created_at, approved_at, rejected_reason, table_name,
         served_at, updated_at, payment_method, channel
  INTO v_row
  FROM public.orders WHERE id = p_order_id AND public_token = p_token;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'service_type', v_row.service_type,
    'customer_name', v_row.customer_name_snapshot,
    'total', v_row.total,
    'delivery_fee', v_row.delivery_fee,
    'estimated_ready_at', v_row.estimated_ready_at,
    'created_at', v_row.created_at,
    'approved_at', v_row.approved_at,
    'rejected_reason', v_row.rejected_reason,
    'short_code', v_row.table_name,
    'served_at', v_row.served_at,
    'updated_at', v_row.updated_at,
    'payment_method', v_row.payment_method,
    'channel', v_row.channel
  );
END;
$$;

-- 2) Histórico de pedidos por telefone (apenas online, últimos 10)
CREATE OR REPLACE FUNCTION public.get_customer_orders(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_digits text;
  v_result jsonb;
BEGIN
  v_digits := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  IF v_digits IS NULL OR length(v_digits) < 10 OR length(v_digits) > 13 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  WITH last_orders AS (
    SELECT o.id, o.status, o.total, o.service_type, o.created_at, o.estimated_ready_at,
           o.public_token, o.payment_method
    FROM public.orders o
    WHERE o.channel = 'online'
      AND regexp_replace(coalesce(o.customer_phone_snapshot,''), '\D', '', 'g') = v_digits
    ORDER BY o.created_at DESC
    LIMIT 10
  ),
  with_items AS (
    SELECT lo.*,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'product_id', oi.product_id,
          'product_name', oi.product_name,
          'product_price', oi.product_price,
          'quantity', oi.quantity,
          'note', oi.note
        ) ORDER BY oi.product_name)
        FROM public.order_items oi WHERE oi.order_id = lo.id
      ) AS items
    FROM last_orders lo
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'status', status,
    'total', total,
    'service_type', service_type,
    'created_at', created_at,
    'estimated_ready_at', estimated_ready_at,
    'public_token', public_token,
    'payment_method', payment_method,
    'items', coalesce(items, '[]'::jsonb)
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM with_items;

  RETURN coalesce(v_result, '[]'::jsonb);
END;
$$;