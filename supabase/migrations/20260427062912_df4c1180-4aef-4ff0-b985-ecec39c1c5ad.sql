-- Allow public INSERT/UPDATE on settings table so print_config persists across devices.
-- POS system has no auth; access is intentionally open for operational settings.
CREATE POLICY "settings_insert" ON public.settings
  FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "settings_update" ON public.settings
  FOR UPDATE TO public
  USING (true)
  WITH CHECK (true);