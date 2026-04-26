-- Conta quantas versões da função create_public_order existem
CREATE OR REPLACE FUNCTION public.count_public_order_funcs()
RETURNS TABLE(n integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int AS n
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'create_public_order';
$$;

-- Remove uma duplicata antiga conhecida (assinatura antiga) sem afetar a versão correta
CREATE OR REPLACE FUNCTION public.fix_create_public_order_duplicate()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_oid oid;
  v_args text;
  v_dropped int := 0;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'create_public_order';

  IF v_count <= 1 THEN
    RETURN format('OK: %s versão(ões) — nada a fazer', v_count);
  END IF;

  -- Mata a(s) versão(ões) extra(s), preservando a mais nova (maior oid)
  FOR v_oid, v_args IN
    SELECT p.oid, pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'create_public_order'
    ORDER BY p.oid ASC  -- antigas primeiro
    LIMIT GREATEST(v_count - 1, 0)
  LOOP
    EXECUTE format('DROP FUNCTION public.create_public_order(%s)', v_args);
    v_dropped := v_dropped + 1;
  END LOOP;

  RETURN format('Removidas %s versão(ões) duplicada(s) de create_public_order', v_dropped);
END;
$$;