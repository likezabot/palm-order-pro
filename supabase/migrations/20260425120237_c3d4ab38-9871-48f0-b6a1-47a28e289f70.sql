
-- Bucket público para fotos de produtos
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "product_images_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "product_images_public_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "product_images_public_update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "product_images_public_delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RPC: admin atualiza APENAS campos do cardápio online
CREATE OR REPLACE FUNCTION public.admin_update_product_online(
  p_id uuid,
  p_description text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_is_featured boolean DEFAULT NULL,
  p_is_available_online boolean DEFAULT NULL,
  p_is_sold_out boolean DEFAULT NULL,
  p_display_order integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products
  SET
    description         = COALESCE(p_description, description),
    image_url           = COALESCE(p_image_url, image_url),
    is_featured         = COALESCE(p_is_featured, is_featured),
    is_available_online = COALESCE(p_is_available_online, is_available_online),
    is_sold_out         = COALESCE(p_is_sold_out, is_sold_out),
    display_order       = COALESCE(p_display_order, display_order)
  WHERE id = p_id;
END;
$$;
