-- 1. Fix Function Search Path Mutable for all functions in public schema
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT 
            p.proname as function_name,
            n.nspname as schema_name,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
    LOOP
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', 
                       func_record.function_name, 
                       func_record.args);
    END LOOP;
END $$;

-- 2. Revoke Public Can Execute SECURITY DEFINER Functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Grant back to anon for necessary guest functions with specific signatures
GRANT EXECUTE ON FUNCTION public.create_order(text, text, numeric, jsonb, boolean, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_order_status(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_loyalty_status(text, text, numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_loyalty_status(text, text, numeric, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_customer(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_customer(text, text, text, text, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_print_config() TO anon;
GRANT EXECUTE ON FUNCTION public.claim_order_print(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.complete_order_print(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fail_order_print(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_print_job() TO anon;
GRANT EXECUTE ON FUNCTION public.complete_print_job(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fail_print_job(uuid, text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.enqueue_print_job(uuid, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.is_restaurant_open(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_manager_pin(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public._require_manager_pin(text) TO anon;

-- 3. Fix RLS Policy Always True (Permissive policies)
DROP POLICY IF EXISTS "error_log_insert" ON public.error_log;
DROP POLICY IF EXISTS "error_log_update" ON public.error_log;
DROP POLICY IF EXISTS "error_log_delete" ON public.error_log;
CREATE POLICY "error_log_insert" ON public.error_log FOR INSERT WITH CHECK (true);
CREATE POLICY "error_log_update" ON public.error_log FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "error_log_delete" ON public.error_log FOR DELETE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "print_jobs_insert" ON public.print_jobs;
DROP POLICY IF EXISTS "print_jobs_update" ON public.print_jobs;
CREATE POLICY "print_jobs_insert" ON public.print_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "print_jobs_update" ON public.print_jobs FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can insert printer logs" ON public.printer_logs;
CREATE POLICY "printer_logs_insert" ON public.printer_logs FOR INSERT WITH CHECK (true);
