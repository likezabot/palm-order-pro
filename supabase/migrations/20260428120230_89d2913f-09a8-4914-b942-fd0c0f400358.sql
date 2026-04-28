-- Update the admin_upsert_product function to include image_url and other fields
CREATE OR REPLACE FUNCTION public.admin_upsert_product(
  p_pin text,
  p_id uuid,
  p_name text,
  p_price numeric,
  p_category text,
  p_active boolean,
  p_aliases text[],
  p_unit text DEFAULT 'unidade',
  p_image_url text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_featured boolean DEFAULT false,
  p_is_available_online boolean DEFAULT true,
  p_is_sold_out boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public._require_manager_pin(p_pin);
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_price IS NULL OR p_price < 0 OR p_price > 99999 THEN RAISE EXCEPTION 'invalid_price'; END IF;
  IF p_category IS NULL OR length(trim(p_category)) = 0 THEN RAISE EXCEPTION 'category_required'; END IF;

  IF p_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.products WHERE id = p_id) THEN
    UPDATE public.products
    SET name = trim(p_name), 
        price = p_price, 
        category = trim(p_category),
        active = p_active, 
        aliases = COALESCE(p_aliases, '{}'),
        unit = COALESCE(p_unit, 'unidade'),
        image_url = p_image_url,
        description = p_description,
        is_featured = p_is_featured,
        is_available_online = p_is_available_online,
        is_sold_out = p_is_sold_out
    WHERE id = p_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.products (
      name, price, category, active, aliases, unit, image_url, description, is_featured, is_available_online, is_sold_out
    )
    VALUES (
      trim(p_name), p_price, trim(p_category), p_active, COALESCE(p_aliases, '{}'), COALESCE(p_unit, 'unidade'), p_image_url, p_description, p_is_featured, p_is_available_online, p_is_sold_out
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;