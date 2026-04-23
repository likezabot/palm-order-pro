-- Move pgcrypto para schema próprio
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pgcrypto SET SCHEMA extensions;

-- Garante que verify_manager_pin / _require_manager_pin enxerguem crypt()
ALTER FUNCTION public.verify_manager_pin(text, text) SET search_path = public, extensions;
ALTER FUNCTION public._require_manager_pin(text) SET search_path = public, extensions;

-- Remove RLS permissiva do undo stack (acesso apenas via service_role/RPC)
DROP POLICY IF EXISTS "service writes undo" ON public.telegram_undo_stack;
CREATE POLICY telegram_undo_no_public ON public.telegram_undo_stack
  FOR ALL TO public USING (false) WITH CHECK (false);