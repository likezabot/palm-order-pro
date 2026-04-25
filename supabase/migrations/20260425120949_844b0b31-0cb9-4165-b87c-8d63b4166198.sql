CREATE OR REPLACE FUNCTION public.admin_update_product_online(
  p_id uuid,
  p_description text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_is_featured boolean DEFAULT NULL,
  p_is_available_online boolean DEFAULT NULL,
  p_is_sold_out boolean DEFAULT NULL,
  p_display_order integer DEFAULT NULL,
  p_clear_description boolean DEFAULT false,
  p_clear_image_url boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products
  SET
    description = CASE
      WHEN p_clear_description THEN NULL
      WHEN p_description IS NOT NULL THEN p_description
      ELSE description
    END,
    image_url = CASE
      WHEN p_clear_image_url THEN NULL
      WHEN p_image_url IS NOT NULL THEN p_image_url
      ELSE image_url
    END,
    is_featured = COALESCE(p_is_featured, is_featured),
    is_available_online = COALESCE(p_is_available_online, is_available_online),
    is_sold_out = COALESCE(p_is_sold_out, is_sold_out),
    display_order = COALESCE(p_display_order, display_order)
  WHERE id = p_id;
END;
$$;