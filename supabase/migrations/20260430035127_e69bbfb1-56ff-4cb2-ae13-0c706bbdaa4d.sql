-- Revogar execução pública de funções administrativas para anon
DO $$ 
DECLARE 
  f record;
BEGIN
  FOR f IN (
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' 
    AND p.proname LIKE 'admin_%'
  ) 
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', f.proname, f.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM public', f.proname, f.args);
  END LOOP;
END $$;

-- Garantir que usuários autenticados ainda possam executar (se necessário)
-- Nota: O ideal seria restringir por role 'admin', mas isso depende da lógica da aplicação.
-- Por enquanto, removemos apenas o acesso anônimo/público padrão.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
