-- Create storage bucket for printer assets (logos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('printer-assets', 'printer-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for printer-assets bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Printer assets are publicly accessible'
  ) THEN
    CREATE POLICY "Printer assets are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'printer-assets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Authenticated users can upload printer assets'
  ) THEN
    CREATE POLICY "Authenticated users can upload printer assets"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'printer-assets' AND auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Authenticated users can update printer assets'
  ) THEN
    CREATE POLICY "Authenticated users can update printer assets"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'printer-assets' AND auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Authenticated users can delete printer assets'
  ) THEN
    CREATE POLICY "Authenticated users can delete printer assets"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'printer-assets' AND auth.role() = 'authenticated');
  END IF;
END $$;
