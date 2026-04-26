-- Função para criar/atualizar brindes padrão de fidelidade
CREATE OR REPLACE FUNCTION public.admin_loyalty_seed_default_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_reward record;
  v_existing_id uuid;
  v_defaults jsonb := '[
    {"name": "Água mineral grátis",        "cost": 12, "min": 25,  "sort": 10},
    {"name": "Refrigerante lata grátis",   "cost": 18, "min": 35,  "sort": 20},
    {"name": "Porção de arroz grátis",     "cost": 25, "min": 45,  "sort": 30},
    {"name": "Espeto de frango grátis",    "cost": 35, "min": 60,  "sort": 40},
    {"name": "Espeto bovino grátis",       "cost": 45, "min": 80,  "sort": 50},
    {"name": "Jantinha brinde",            "cost": 60, "min": 100, "sort": 60}
  ]'::jsonb;
BEGIN
  SELECT id INTO v_restaurant_id
  FROM public.restaurants
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_restaurant_found'
    );
  END IF;

  FOR v_reward IN
    SELECT
      (elem->>'name')::text     AS display_name,
      (elem->>'cost')::int      AS points_cost,
      (elem->>'min')::numeric   AS min_order_subtotal,
      (elem->>'sort')::int      AS sort_order
    FROM jsonb_array_elements(v_defaults) AS elem
  LOOP
    SELECT id INTO v_existing_id
    FROM public.loyalty_rewards
    WHERE restaurant_id = v_restaurant_id
      AND lower(display_name) = lower(v_reward.display_name)
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.loyalty_rewards
      SET points_cost        = v_reward.points_cost,
          min_order_subtotal = v_reward.min_order_subtotal,
          sort_order         = v_reward.sort_order,
          active             = true,
          updated_at         = now()
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.loyalty_rewards (
        restaurant_id, display_name, points_cost,
        min_order_subtotal, active, sort_order
      ) VALUES (
        v_restaurant_id, v_reward.display_name, v_reward.points_cost,
        v_reward.min_order_subtotal, true, v_reward.sort_order
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'restaurant_id', v_restaurant_id,
    'inserted', v_inserted,
    'updated', v_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_loyalty_seed_default_rewards() TO anon, authenticated;

-- Rodar o seed uma vez agora
SELECT public.admin_loyalty_seed_default_rewards();