-- Remove agendamento anterior se existir
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'health-check-every-5min';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

-- Agenda a cada 5 minutos
SELECT cron.schedule(
  'health-check-every-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gbpcjjtxqtzqotmkfxrh.supabase.co/functions/v1/health-check',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdicGNqanR4cXR6cW90bWtmeHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTE0OTIsImV4cCI6MjA5MTcyNzQ5Mn0.K82zsqXu_airg_b3GYtKQ2vk7r5hYj_nYrt3AcmurD8"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  ) AS request_id;
  $cron$
);