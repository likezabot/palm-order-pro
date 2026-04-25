-- RPCs administrativas para configurações do cardápio online

CREATE OR REPLACE FUNCTION public.admin_update_restaurant(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_whatsapp_phone text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_hero_url text DEFAULT NULL,
  p_pix_key text DEFAULT NULL,
  p_is_open_override text DEFAULT NULL,
  p_default_prep_minutes integer DEFAULT NULL,
  p_delivery_prep_buffer integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_is_open_override IS NOT NULL AND p_is_open_override NOT IN ('auto','open','closed') THEN
    RAISE EXCEPTION 'invalid is_open_override';
  END IF;
  IF p_default_prep_minutes IS NOT NULL AND p_default_prep_minutes < 0 THEN
    RAISE EXCEPTION 'default_prep_minutes must be >= 0';
  END IF;
  IF p_delivery_prep_buffer IS NOT NULL AND p_delivery_prep_buffer < 0 THEN
    RAISE EXCEPTION 'delivery_prep_buffer must be >= 0';
  END IF;

  UPDATE public.restaurants SET
    name = COALESCE(p_name, name),
    description = CASE WHEN p_description IS NULL THEN description
                       WHEN p_description = '' THEN NULL
                       ELSE p_description END,
    whatsapp_phone = CASE WHEN p_whatsapp_phone IS NULL THEN whatsapp_phone
                          WHEN p_whatsapp_phone = '' THEN NULL
                          ELSE p_whatsapp_phone END,
    logo_url = CASE WHEN p_logo_url IS NULL THEN logo_url
                    WHEN p_logo_url = '' THEN NULL
                    ELSE p_logo_url END,
    hero_url = CASE WHEN p_hero_url IS NULL THEN hero_url
                    WHEN p_hero_url = '' THEN NULL
                    ELSE p_hero_url END,
    pix_key = CASE WHEN p_pix_key IS NULL THEN pix_key
                   WHEN p_pix_key = '' THEN NULL
                   ELSE p_pix_key END,
    is_open_override = COALESCE(p_is_open_override, is_open_override),
    default_prep_minutes = COALESCE(p_default_prep_minutes, default_prep_minutes),
    delivery_prep_buffer = COALESCE(p_delivery_prep_buffer, delivery_prep_buffer),
    updated_at = now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_business_hours(
  p_restaurant_id uuid,
  p_hours jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec jsonb;
  v_weekday smallint;
  v_opens time;
  v_closes time;
  v_closed boolean;
BEGIN
  IF jsonb_typeof(p_hours) <> 'array' THEN
    RAISE EXCEPTION 'p_hours must be a JSON array';
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_hours) LOOP
    v_weekday := (rec->>'weekday')::smallint;
    v_closed := COALESCE((rec->>'is_closed')::boolean, false);
    v_opens := NULLIF(rec->>'opens_at','')::time;
    v_closes := NULLIF(rec->>'closes_at','')::time;

    IF v_weekday < 0 OR v_weekday > 6 THEN
      RAISE EXCEPTION 'weekday must be 0..6';
    END IF;

    IF NOT v_closed THEN
      IF v_opens IS NULL OR v_closes IS NULL THEN
        RAISE EXCEPTION 'opens_at and closes_at required when not closed (weekday %)', v_weekday;
      END IF;
      IF v_closes <= v_opens THEN
        RAISE EXCEPTION 'closes_at must be after opens_at (weekday %)', v_weekday;
      END IF;
    END IF;

    INSERT INTO public.business_hours (restaurant_id, weekday, opens_at, closes_at, is_closed)
    VALUES (p_restaurant_id, v_weekday,
            CASE WHEN v_closed THEN NULL ELSE v_opens END,
            CASE WHEN v_closed THEN NULL ELSE v_closes END,
            v_closed)
    ON CONFLICT (restaurant_id, weekday) DO UPDATE SET
      opens_at = EXCLUDED.opens_at,
      closes_at = EXCLUDED.closes_at,
      is_closed = EXCLUDED.is_closed;
  END LOOP;
END;
$$;

-- Garantir índice único para o ON CONFLICT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='business_hours_restaurant_weekday_key'
  ) THEN
    BEGIN
      ALTER TABLE public.business_hours
        ADD CONSTRAINT business_hours_restaurant_weekday_key UNIQUE (restaurant_id, weekday);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_upsert_delivery_zone(
  p_id uuid,
  p_restaurant_id uuid,
  p_name text,
  p_fee numeric,
  p_min_order numeric,
  p_estimated_minutes integer,
  p_match_neighborhoods text[],
  p_active boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_neighborhoods text[];
BEGIN
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name required';
  END IF;
  IF p_fee < 0 THEN RAISE EXCEPTION 'fee must be >= 0'; END IF;
  IF p_min_order < 0 THEN RAISE EXCEPTION 'min_order must be >= 0'; END IF;
  IF p_estimated_minutes <= 0 THEN RAISE EXCEPTION 'estimated_minutes must be > 0'; END IF;

  SELECT COALESCE(array_agg(DISTINCT lower(btrim(n))) FILTER (WHERE btrim(n) <> ''), '{}')
    INTO v_neighborhoods
    FROM unnest(COALESCE(p_match_neighborhoods, '{}'::text[])) AS n;

  IF p_id IS NULL THEN
    INSERT INTO public.delivery_zones
      (restaurant_id, name, fee, min_order, estimated_minutes, match_neighborhoods, active)
    VALUES
      (p_restaurant_id, btrim(p_name), p_fee, p_min_order, p_estimated_minutes, v_neighborhoods, COALESCE(p_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.delivery_zones SET
      name = btrim(p_name),
      fee = p_fee,
      min_order = p_min_order,
      estimated_minutes = p_estimated_minutes,
      match_neighborhoods = v_neighborhoods,
      active = COALESCE(p_active, active)
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_delivery_zone(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.delivery_zones WHERE id = p_id;
END;
$$;