-- Create storage bucket for printer assets (logos)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('printer-assets', 'printer-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for printer-assets bucket
CREATE POLICY "Printer assets are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'printer-assets');

CREATE POLICY "Authenticated users can upload printer assets" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'printer-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update printer assets" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'printer-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete printer assets" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'printer-assets' AND auth.role() = 'authenticated');
