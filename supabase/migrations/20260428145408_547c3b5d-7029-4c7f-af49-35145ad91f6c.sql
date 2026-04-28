DROP FUNCTION IF EXISTS public.admin_loyalty_list_rewards(uuid);

-- 1. Recria admin_loyalty_list_rewards
CREATE OR REPLACE FUNCTION public.admin_loyalty_list_rewards(p_restaurant_id uuid)
RETURNS TABLE (
  id uuid,
  restaurant_id uuid,
  product_id uuid,
  product_name text,
  product_price numeric,
  display_name text,
  points_cost integer,
  min_order_subtotal numeric,
  active boolean,
  sort_order integer,
  allow_pickup boolean,
  allow_delivery boolean,
  description text,
  effective_cost_per_point numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.restaurant_id,
    r.product_id,
    p.name as product_name,
    p.price as product_price,
    r.display_name,
    r.points_cost,
    r.min_order_subtotal,
    r.active,
    r.sort_order,
    r.allow_pickup,
    r.allow_delivery,
    r.description,
    CASE 
      WHEN r.points_cost > 0 THEN p.price / r.points_cost 
      ELSE NULL 
    END as effective_cost_per_point
  FROM public.loyalty_rewards r
  LEFT JOIN public.products p ON p.id = r.product_id
  WHERE r.restaurant_id = p_restaurant_id
  ORDER BY r.sort_order ASC, r.display_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualiza admin_loyalty_upsert_reward
CREATE OR REPLACE FUNCTION public.admin_loyalty_upsert_reward(
  p_id uuid,
  p_restaurant_id uuid,
  p_display_name text,
  p_points_cost integer,
  p_min_order_subtotal numeric DEFAULT 0,
  p_active boolean DEFAULT true,
  p_sort_order integer DEFAULT 0,
  p_product_id uuid DEFAULT NULL,
  p_allow_pickup boolean DEFAULT true,
  p_allow_delivery boolean DEFAULT false,
  p_description text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_display_name IS NULL OR length(trim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_display_name';
  END IF;
  IF p_points_cost IS NULL OR p_points_cost < 100 THEN
    RAISE EXCEPTION 'points_cost_min_100';
  END IF;
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_restaurant';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.loyalty_rewards
      (restaurant_id, product_id, display_name, points_cost, min_order_subtotal, active, sort_order, allow_pickup, allow_delivery, description)
    VALUES
      (p_restaurant_id, p_product_id, trim(p_display_name), p_points_cost,
       COALESCE(p_min_order_subtotal, 0), COALESCE(p_active, true), COALESCE(p_sort_order, 0), 
       COALESCE(p_allow_pickup, true), COALESCE(p_allow_delivery, false), p_description)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.loyalty_rewards
       SET product_id          = p_product_id,
           display_name        = trim(p_display_name),
           points_cost         = p_points_cost,
           min_order_subtotal  = COALESCE(p_min_order_subtotal, 0),
           active              = COALESCE(p_active, true),
           sort_order          = COALESCE(p_sort_order, 0),
           allow_pickup        = COALESCE(p_allow_pickup, allow_pickup),
           allow_delivery      = COALESCE(p_allow_delivery, allow_delivery),
           description         = COALESCE(p_description, description)
     WHERE id = p_id
     RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Atualiza admin_loyalty_search_customer
CREATE OR REPLACE FUNCTION public.admin_loyalty_search_customer(p_phone text)
RETURNS jsonb AS $$
DECLARE
  v_phone text;
  v_cust record;
  v_balance integer := 0;
  v_earned integer := 0;
  v_history jsonb;
BEGIN
  v_phone := public.normalize_phone(p_phone);
  IF v_phone IS NULL THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT * INTO v_cust FROM public.customers WHERE phone = v_phone LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT balance, total_earned INTO v_balance, v_earned
    FROM public.loyalty_accounts WHERE phone = v_phone;

  SELECT jsonb_agg(h) INTO v_history
  FROM (
    SELECT id, kind, points, order_id, admin_note, created_at
    FROM public.loyalty_history
    WHERE phone = v_phone
    ORDER BY created_at DESC
    LIMIT 10
  ) h;

  RETURN jsonb_build_object(
    'found', true,
    'phone', v_phone,
    'balance', COALESCE(v_balance, 0),
    'total_earned', COALESCE(v_earned, 0),
    'last_customer_name', v_cust.name,
    'street', v_cust.street,
    'number', v_cust.number,
    'neighborhood', v_cust.neighborhood,
    'complement', v_cust.complement,
    'reference', v_cust.reference,
    'history', COALESCE(v_history, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
