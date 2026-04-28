CREATE OR REPLACE FUNCTION public.get_public_loyalty_status(
  p_phone text, 
  p_restaurant_slug text, 
  p_order_subtotal numeric DEFAULT 0, 
  p_service_type text DEFAULT 'pickup'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_enabled       boolean;
  v_phone         text;
  v_balance       integer := 0;
  v_per_real      numeric;
  v_restaurant_id uuid;
  v_rewards       jsonb;
  v_projected     integer := 0;
  v_service_type  text;
BEGIN
  v_enabled := public._loyalty_setting_bool('loyalty_enabled', false);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  v_phone     := public.normalize_phone(p_phone);
  v_per_real  := public._loyalty_setting_numeric('loyalty_points_per_real', 1);
  v_service_type := COALESCE(p_service_type, 'pickup');

  SELECT id INTO v_restaurant_id FROM public.restaurants WHERE slug = p_restaurant_slug;
  IF v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object('enabled', true, 'balance', 0, 'rewards', '[]'::jsonb,
      'points_per_real', v_per_real, 'projected_earn', 0,
      'service_type', v_service_type);
  END IF;

  IF v_phone IS NOT NULL AND length(v_phone) >= 10 THEN
    SELECT COALESCE(balance, 0) INTO v_balance
      FROM public.loyalty_accounts WHERE phone = v_phone;
  END IF;

  -- Acumula pontos em qualquer modalidade
  v_projected := floor(GREATEST(COALESCE(p_order_subtotal,0), 0) * v_per_real)::integer;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'display_name', r.display_name,
    'points_cost', r.points_cost,
    'min_order_subtotal', r.min_order_subtotal,
    'available', (
      v_balance >= r.points_cost
      AND COALESCE(p_order_subtotal, 0) >= r.min_order_subtotal
    ),
    'blocked_reason', CASE
      WHEN v_balance < r.points_cost
        THEN 'missing_points:' || (r.points_cost - v_balance)::text
      WHEN COALESCE(p_order_subtotal, 0) < r.min_order_subtotal
        THEN 'min_subtotal:' || r.min_order_subtotal::text
      ELSE NULL
    END
  ) ORDER BY r.sort_order, r.display_name), '[]'::jsonb)
  INTO v_rewards
  FROM public.loyalty_rewards r
  WHERE r.restaurant_id = v_restaurant_id
    AND r.active = true;

  RETURN jsonb_build_object(
    'enabled', true,
    'balance', v_balance,
    'rewards', v_rewards,
    'points_per_real', v_per_real,
    'projected_earn', v_projected,
    'service_type', v_service_type
  );
END;
$function$;

-- Também atualizamos a versão com 3 parâmetros para consistência
CREATE OR REPLACE FUNCTION public.get_public_loyalty_status(
  p_phone text, 
  p_restaurant_slug text, 
  p_order_subtotal numeric DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.get_public_loyalty_status(p_phone, p_restaurant_slug, p_order_subtotal, 'pickup');
END;
$function$;