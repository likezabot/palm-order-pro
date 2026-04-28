-- Ensure bucket exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read access
CREATE POLICY "Public read access for product-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Authenticated upload access
CREATE POLICY "Authenticated upload access for product-images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

-- Authenticated update access
CREATE POLICY "Authenticated update access for product-images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

-- Authenticated delete access
CREATE POLICY "Authenticated delete access for product-images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');
