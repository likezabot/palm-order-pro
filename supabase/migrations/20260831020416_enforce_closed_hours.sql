-- Hotfix: a Plano B nao abre aos domingos e nunca deve aceitar pedido
-- fora do horario configurado.

INSERT INTO public.settings (key, value)
VALUES ('allow_public_checkout_when_closed', 'false')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

UPDATE public.restaurants
SET is_open_override = 'auto'
WHERE slug = 'plano-b-espetaria';

UPDATE public.business_hours AS bh
SET opens_at = NULL,
    closes_at = NULL,
    is_closed = true
FROM public.restaurants AS r
WHERE bh.restaurant_id = r.id
  AND r.slug = 'plano-b-espetaria'
  AND bh.weekday = 0;

INSERT INTO public.business_hours (restaurant_id, weekday, opens_at, closes_at, is_closed)
SELECT r.id, 0, NULL, NULL, true
FROM public.restaurants AS r
WHERE r.slug = 'plano-b-espetaria'
  AND NOT EXISTS (
    SELECT 1
    FROM public.business_hours AS bh
    WHERE bh.restaurant_id = r.id
      AND bh.weekday = 0
  );

CREATE OR REPLACE FUNCTION public.is_restaurant_open(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override text;
  v_now_local timestamp without time zone;
  v_weekday smallint;
  v_time time;
  v_row public.business_hours%ROWTYPE;
BEGIN
  v_now_local := now() AT TIME ZONE 'America/Campo_Grande';
  v_weekday := EXTRACT(DOW FROM v_now_local)::smallint;
  v_time := v_now_local::time;

  -- Regra operacional fixa: domingo nunca recebe pedido, nem por override.
  IF v_weekday = 0 THEN
    RETURN false;
  END IF;

  SELECT is_open_override
  INTO v_override
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_override = 'closed' THEN RETURN false; END IF;
  IF v_override = 'open' THEN RETURN true; END IF;

  SELECT *
  INTO v_row
  FROM public.business_hours
  WHERE restaurant_id = p_restaurant_id
    AND weekday = v_weekday
  LIMIT 1;

  IF NOT FOUND OR v_row.is_closed THEN RETURN false; END IF;
  IF v_row.opens_at IS NULL OR v_row.closes_at IS NULL THEN RETURN false; END IF;

  IF v_row.closes_at > v_row.opens_at THEN
    RETURN v_time >= v_row.opens_at AND v_time <= v_row.closes_at;
  END IF;

  RETURN v_time >= v_row.opens_at OR v_time <= v_row.closes_at;
END;
$$;

COMMENT ON FUNCTION public.is_restaurant_open(uuid) IS
  'Status da loja no fuso America/Campo_Grande; domingo e sempre fechado.';
