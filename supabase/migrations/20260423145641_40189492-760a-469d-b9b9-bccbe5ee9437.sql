-- Torna a checagem de PIN um no-op (mantém função para compatibilidade)
CREATE OR REPLACE FUNCTION public._require_manager_pin(p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- PIN desabilitado por escolha do operador.
  -- Função mantida para não quebrar RPCs que ainda chamam PERFORM _require_manager_pin(...).
  RETURN;
END;
$function$;

-- verify_manager_pin: passa a aceitar qualquer chamada como válida (sem checar profiles).
-- Mantém o registro no log para auditoria, caso algum fluxo ainda chame.
CREATE OR REPLACE FUNCTION public.verify_manager_pin(p_pin text, p_fingerprint text DEFAULT 'unknown')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  INSERT INTO public.pin_attempt_log (client_fingerprint, success)
  VALUES (coalesce(p_fingerprint,'unknown'), true);
  RETURN true;
END;
$function$;