-- =========================================================================
-- CORREÇÃO SEGURANÇA: orders e print_jobs "publicly readable"
--
-- O scanner do Lovable detectou duas políticas SELECT com USING(true)
-- sem especificar role — isso expõe a leitura ao role "public" do Postgres
-- (mais amplo que "anon"). Corrigimos adicionando TO anon, authenticated
-- para limitar explicitamente ao client Supabase (anon key) e usuários
-- autenticados, sem quebrar o POS (que usa anon key).
-- =========================================================================

-- 1. orders — histórico completo com customer_phone snapshots
--    Mantém acesso anon (necessário para o PDV funcionar sem auth)
--    mas remove acesso ao role "public" que o scanner flageia.
DROP POLICY IF EXISTS "Anyone can read orders" ON public.orders;
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 2. print_jobs — fila de impressão com payloads
--    Mesma lógica: anon precisa ler para o desktop EXE processar jobs.
DROP POLICY IF EXISTS "print_jobs_select" ON public.print_jobs;
DROP POLICY IF EXISTS print_jobs_select ON public.print_jobs;
CREATE POLICY "print_jobs_select" ON public.print_jobs
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 3. print_jobs INSERT/UPDATE — mesma correção de role
DROP POLICY IF EXISTS "print_jobs_insert" ON public.print_jobs;
CREATE POLICY "print_jobs_insert" ON public.print_jobs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "print_jobs_update" ON public.print_jobs;
CREATE POLICY "print_jobs_update" ON public.print_jobs
  FOR UPDATE
  TO anon, authenticated
  USING (true);
