-- Tabela de resumo diário
CREATE TABLE IF NOT EXISTS public.error_log_daily_summary (
  summary_date date PRIMARY KEY,
  generated_at timestamptz NOT NULL DEFAULT now(),
  total_unresolved integer NOT NULL DEFAULT 0,
  total_today integer NOT NULL DEFAULT 0,
  by_severity jsonb NOT NULL DEFAULT '{}'::jsonb,
  by_source jsonb NOT NULL DEFAULT '[]'::jsonb,
  by_code jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_messages jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.error_log_daily_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "error_log_daily_summary_select" ON public.error_log_daily_summary;
CREATE POLICY "error_log_daily_summary_select"
  ON public.error_log_daily_summary
  FOR SELECT
  USING (true);

-- Função geradora do resumo
CREATE OR REPLACE FUNCTION public.build_error_log_daily_summary(p_date date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_unresolved integer;
  v_total_today integer;
  v_by_severity jsonb;
  v_by_source jsonb;
  v_by_code jsonb;
  v_top_messages jsonb;
  v_day_start timestamptz := (p_date::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_day_end timestamptz := ((p_date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_result jsonb;
BEGIN
  SELECT count(*) INTO v_total_unresolved
  FROM public.error_log
  WHERE resolved = false;

  SELECT count(*) INTO v_total_today
  FROM public.error_log
  WHERE resolved = false
    AND occurred_at >= v_day_start
    AND occurred_at < v_day_end;

  SELECT COALESCE(jsonb_object_agg(severity, c), '{}'::jsonb) INTO v_by_severity
  FROM (
    SELECT severity, count(*)::int AS c
    FROM public.error_log
    WHERE resolved = false
    GROUP BY severity
  ) s;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_by_source
  FROM (
    SELECT source, count(*)::int AS count
    FROM public.error_log
    WHERE resolved = false
    GROUP BY source
    ORDER BY count(*) DESC
    LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_by_code
  FROM (
    SELECT
      COALESCE(code, '(sem código)') AS code,
      count(*)::int AS count,
      max(occurred_at) AS last_seen,
      min(occurred_at) AS first_seen,
      (array_agg(DISTINCT source))[1:5] AS sources
    FROM public.error_log
    WHERE resolved = false
    GROUP BY COALESCE(code, '(sem código)')
    ORDER BY count(*) DESC
    LIMIT 30
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_messages
  FROM (
    SELECT message, count(*)::int AS count, max(severity) AS severity, max(source) AS source
    FROM public.error_log
    WHERE resolved = false
    GROUP BY message
    ORDER BY count(*) DESC
    LIMIT 10
  ) t;

  INSERT INTO public.error_log_daily_summary (
    summary_date, generated_at, total_unresolved, total_today,
    by_severity, by_source, by_code, top_messages
  )
  VALUES (
    p_date, now(), v_total_unresolved, v_total_today,
    v_by_severity, v_by_source, v_by_code, v_top_messages
  )
  ON CONFLICT (summary_date) DO UPDATE SET
    generated_at = excluded.generated_at,
    total_unresolved = excluded.total_unresolved,
    total_today = excluded.total_today,
    by_severity = excluded.by_severity,
    by_source = excluded.by_source,
    by_code = excluded.by_code,
    top_messages = excluded.top_messages;

  v_result := jsonb_build_object(
    'summary_date', p_date,
    'total_unresolved', v_total_unresolved,
    'total_today', v_total_today,
    'by_severity', v_by_severity,
    'by_source', v_by_source,
    'by_code', v_by_code,
    'top_messages', v_top_messages,
    'generated_at', now()
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_error_log_daily_summary(date) TO anon, authenticated, service_role;