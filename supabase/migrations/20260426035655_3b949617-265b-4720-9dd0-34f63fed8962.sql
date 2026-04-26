CREATE OR REPLACE FUNCTION public.annotate_error_log_resolution(
  p_code text DEFAULT NULL,
  p_ids bigint[] DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_reason IS NULL OR length(p_reason) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.error_log
     SET context = COALESCE(context, '{}'::jsonb)
                   || jsonb_build_object(
                        'resolved_reason', p_reason,
                        'resolved_by', 'health-check',
                        'resolved_at_iso', now()
                      )
   WHERE resolved = true
     AND (p_code IS NULL OR code = p_code)
     AND (p_ids IS NULL OR id = ANY(p_ids))
     AND (context->>'resolved_reason') IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;