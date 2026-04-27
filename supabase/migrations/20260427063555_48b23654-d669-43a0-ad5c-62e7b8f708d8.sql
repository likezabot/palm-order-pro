-- Remove the broad INSERT/UPDATE policies created earlier; only the SECURITY DEFINER
-- RPCs below may write to settings. Anonymous direct writes are now blocked.
DROP POLICY IF EXISTS "settings_insert" ON public.settings;
DROP POLICY IF EXISTS "settings_update" ON public.settings;

CREATE POLICY "settings_no_direct_write"
  ON public.settings
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- Public SELECT policy already exists (settings_select). Keep it for read access
-- since the bridge/EXE may need to read print_config without auth.

-- Save print_config via SECURITY DEFINER. Validates the payload is an object,
-- forces key='print_config', updates updated_at to now().
CREATE OR REPLACE FUNCTION public.admin_save_print_config(p_config jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'p_config must be a JSON object';
  END IF;

  INSERT INTO public.settings (key, value, updated_at)
  VALUES ('print_config', p_config::text, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();
END;
$$;

-- Read print_config returning {value, updated_at}. Returns null if not set.
CREATE OR REPLACE FUNCTION public.get_print_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value text;
  v_updated_at timestamptz;
BEGIN
  SELECT value, updated_at INTO v_value, v_updated_at
  FROM public.settings
  WHERE key = 'print_config';

  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'value', v_value::jsonb,
    'updated_at', v_updated_at
  );
END;
$$;

-- Allow anonymous/public callers (POS has no auth)
GRANT EXECUTE ON FUNCTION public.admin_save_print_config(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_print_config() TO anon, authenticated;