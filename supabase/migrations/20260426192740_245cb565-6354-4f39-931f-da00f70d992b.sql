-- ============================================================================
-- LOYALTY SYSTEM (Sistema de Fidelidade)
-- ============================================================================

-- 1) Função utilitária: normalize_phone
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    ELSE NULLIF(regexp_replace(p_phone, '\D', '', 'g'), '')
  END;
$$;

-- 2) Settings padrão (idempotente)
INSERT INTO public.settings (key, value)
VALUES
  ('loyalty_enabled', 'false'),
  ('loyalty_points_per_real', '1'),
  ('loyalty_min_subtotal_to_earn', '0')
ON CONFLICT (key) DO NOTHING;

-- 3) Tabelas
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  phone              text PRIMARY KEY,
  balance            integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned       integer NOT NULL DEFAULT 0 CHECK (total_earned >= 0),
  last_customer_name text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  product_id          uuid REFERENCES public.products(id) ON DELETE SET NULL,
  display_name        text NOT NULL CHECK (length(trim(display_name)) > 0),
  points_cost         integer NOT NULL CHECK (points_cost > 0),
  min_order_subtotal  numeric NOT NULL DEFAULT 0 CHECK (min_order_subtotal >= 0),
  active              boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_active
  ON public.loyalty_rewards (restaurant_id, active, sort_order);

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL REFERENCES public.loyalty_accounts(phone) ON DELETE CASCADE,
  order_id    uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('earn','redeem','refund','reversal','admin_adjust')),
  points      integer NOT NULL,
  reward_id   uuid REFERENCES public.loyalty_rewards(id) ON DELETE SET NULL,
  admin_note  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_phone_created
  ON public.loyalty_transactions (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_order
  ON public.loyalty_transactions (order_id);

-- Idempotência: só pode existir UM 'earn' por pedido
CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_earn_per_order
  ON public.loyalty_transactions (order_id)
  WHERE kind = 'earn';

-- 4) RLS
ALTER TABLE public.loyalty_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rewards      ENABLE ROW LEVEL SECURITY;

-- accounts e transactions: SEM acesso direto público (acesso só via RPC SECURITY DEFINER)
DROP POLICY IF EXISTS loyalty_accounts_no_public ON public.loyalty_accounts;
CREATE POLICY loyalty_accounts_no_public ON public.loyalty_accounts
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS loyalty_tx_no_public ON public.loyalty_transactions;
CREATE POLICY loyalty_tx_no_public ON public.loyalty_transactions
  FOR ALL TO public USING (false) WITH CHECK (false);

-- rewards: SELECT público apenas dos ativos
DROP POLICY IF EXISTS loyalty_rewards_select_active ON public.loyalty_rewards;
CREATE POLICY loyalty_rewards_select_active ON public.loyalty_rewards
  FOR SELECT TO public USING (active = true);

-- 5) Trigger updated_at em loyalty_*
CREATE OR REPLACE FUNCTION public._loyalty_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_loyalty_accounts_updated_at ON public.loyalty_accounts;
CREATE TRIGGER trg_loyalty_accounts_updated_at
  BEFORE UPDATE ON public.loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION public._loyalty_set_updated_at();

DROP TRIGGER IF EXISTS trg_loyalty_rewards_updated_at ON public.loyalty_rewards;
CREATE TRIGGER trg_loyalty_rewards_updated_at
  BEFORE UPDATE ON public.loyalty_rewards
  FOR EACH ROW EXECUTE FUNCTION public._loyalty_set_updated_at();

-- 6) Funções auxiliares de leitura de settings
CREATE OR REPLACE FUNCTION public._loyalty_setting_bool(p_key text, p_default boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value::text = 'true' FROM public.settings WHERE key = p_key LIMIT 1),
    p_default
  );
$$;

CREATE OR REPLACE FUNCTION public._loyalty_setting_numeric(p_key text, p_default numeric)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_raw text;
BEGIN
  SELECT value INTO v_raw FROM public.settings WHERE key = p_key LIMIT 1;
  IF v_raw IS NULL OR length(trim(v_raw)) = 0 THEN
    RETURN p_default;
  END IF;
  BEGIN
    RETURN v_raw::numeric;
  EXCEPTION WHEN others THEN
    RETURN p_default;
  END;
END;
$$;

-- 7) Trigger principal: orders -> loyalty
CREATE OR REPLACE FUNCTION public._loyalty_on_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone        text;
  v_subtotal     numeric := 0;
  v_per_real     numeric;
  v_min_subtotal numeric;
  v_points       integer;
  v_enabled      boolean;
  v_tx           record;
BEGIN
  -- Só interessa transição de status
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  v_enabled := public._loyalty_setting_bool('loyalty_enabled', false);
  IF NOT v_enabled THEN
    RETURN NEW;
  END IF;

  -- ===== EARN: pedido virou 'paid' =====
  IF OLD.status <> 'paid' AND NEW.status = 'paid'
     AND NEW.channel = 'online'
     AND NEW.service_type IN ('pickup','delivery')
  THEN
    v_phone := public.normalize_phone(NEW.customer_phone_snapshot);
    IF v_phone IS NOT NULL AND length(v_phone) >= 10 THEN
      -- Subtotal de itens, EXCLUINDO brindes
      SELECT COALESCE(SUM(oi.subtotal), 0)
        INTO v_subtotal
      FROM public.order_items oi
      WHERE oi.order_id = NEW.id
        AND oi.product_price > 0
        AND oi.product_name NOT LIKE '[BRINDE]%';

      v_per_real     := public._loyalty_setting_numeric('loyalty_points_per_real', 1);
      v_min_subtotal := public._loyalty_setting_numeric('loyalty_min_subtotal_to_earn', 0);
      v_points       := floor(v_subtotal * v_per_real)::integer;

      IF v_points > 0 AND v_subtotal >= v_min_subtotal THEN
        -- Garante account
        INSERT INTO public.loyalty_accounts (phone, balance, total_earned, last_customer_name)
        VALUES (v_phone, 0, 0, NEW.customer_name_snapshot)
        ON CONFLICT (phone) DO UPDATE
          SET last_customer_name = COALESCE(EXCLUDED.last_customer_name, public.loyalty_accounts.last_customer_name);

        -- Tenta inserir 'earn' (UNIQUE garante idempotência)
        BEGIN
          INSERT INTO public.loyalty_transactions (phone, order_id, kind, points)
          VALUES (v_phone, NEW.id, 'earn', v_points);

          UPDATE public.loyalty_accounts
             SET balance      = balance + v_points,
                 total_earned = total_earned + v_points
           WHERE phone = v_phone;
        EXCEPTION WHEN unique_violation THEN
          -- Já creditado anteriormente, ignora
          NULL;
        END;
      END IF;
    END IF;
  END IF;

  -- ===== CANCEL: pedido virou 'cancelled' =====
  IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
    -- Para cada earn deste pedido, gerar reversal (1x só)
    FOR v_tx IN
      SELECT t.phone, t.points
        FROM public.loyalty_transactions t
       WHERE t.order_id = NEW.id
         AND t.kind = 'earn'
         AND NOT EXISTS (
           SELECT 1 FROM public.loyalty_transactions r
            WHERE r.order_id = t.order_id
              AND r.kind = 'reversal'
              AND r.phone = t.phone
         )
    LOOP
      INSERT INTO public.loyalty_transactions (phone, order_id, kind, points)
      VALUES (v_tx.phone, NEW.id, 'reversal', -v_tx.points);

      UPDATE public.loyalty_accounts
         SET balance = GREATEST(0, balance - v_tx.points)
       WHERE phone = v_tx.phone;
    END LOOP;

    -- Para cada redeem deste pedido, gerar refund (1x só)
    FOR v_tx IN
      SELECT t.phone, t.points
        FROM public.loyalty_transactions t
       WHERE t.order_id = NEW.id
         AND t.kind = 'redeem'
         AND NOT EXISTS (
           SELECT 1 FROM public.loyalty_transactions r
            WHERE r.order_id = t.order_id
              AND r.kind = 'refund'
              AND r.phone = t.phone
         )
    LOOP
      -- redeem.points é negativo; refund devolve em positivo
      INSERT INTO public.loyalty_transactions (phone, order_id, kind, points)
      VALUES (v_tx.phone, NEW.id, 'refund', -v_tx.points);

      UPDATE public.loyalty_accounts
         SET balance = balance + (-v_tx.points)
       WHERE phone = v_tx.phone;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_loyalty_on_order_status ON public.orders;
CREATE TRIGGER trg_loyalty_on_order_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public._loyalty_on_order_status_change();

-- ============================================================================
-- 8) RPC PÚBLICA: get_public_loyalty_status
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_public_loyalty_status(
  p_phone text,
  p_restaurant_slug text,
  p_order_subtotal numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled       boolean;
  v_phone         text;
  v_balance       integer := 0;
  v_per_real      numeric;
  v_restaurant_id uuid;
  v_rewards       jsonb;
BEGIN
  v_enabled := public._loyalty_setting_bool('loyalty_enabled', false);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  v_phone    := public.normalize_phone(p_phone);
  v_per_real := public._loyalty_setting_numeric('loyalty_points_per_real', 1);

  SELECT id INTO v_restaurant_id FROM public.restaurants WHERE slug = p_restaurant_slug;
  IF v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object('enabled', true, 'balance', 0, 'rewards', '[]'::jsonb,
      'points_per_real', v_per_real,
      'projected_earn', 0);
  END IF;

  IF v_phone IS NOT NULL AND length(v_phone) >= 10 THEN
    SELECT COALESCE(balance, 0) INTO v_balance
      FROM public.loyalty_accounts WHERE phone = v_phone;
    IF v_balance IS NULL THEN v_balance := 0; END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'display_name', r.display_name,
    'points_cost', r.points_cost,
    'min_order_subtotal', r.min_order_subtotal,
    'available', (
      v_balance >= r.points_cost
      AND COALESCE(p_order_subtotal, 0) >= r.min_order_subtotal
    ),
    'blocked_reason', CASE
      WHEN v_balance < r.points_cost
        THEN 'missing_points:' || (r.points_cost - v_balance)::text
      WHEN COALESCE(p_order_subtotal, 0) < r.min_order_subtotal
        THEN 'min_subtotal:' || r.min_order_subtotal::text
      ELSE NULL
    END
  ) ORDER BY r.sort_order, r.display_name), '[]'::jsonb)
  INTO v_rewards
  FROM public.loyalty_rewards r
  WHERE r.restaurant_id = v_restaurant_id
    AND r.active = true;

  RETURN jsonb_build_object(
    'enabled', true,
    'balance', v_balance,
    'rewards', v_rewards,
    'points_per_real', v_per_real,
    'projected_earn', floor(GREATEST(COALESCE(p_order_subtotal,0), 0) * v_per_real)::integer
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_loyalty_status(text, text, numeric) TO anon, authenticated;

-- ============================================================================
-- 9) RPCs ADMIN
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_loyalty_set_enabled(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.settings (key, value, updated_at)
  VALUES ('loyalty_enabled', CASE WHEN p_enabled THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_loyalty_set_enabled(boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_loyalty_upsert_reward(
  p_id uuid,
  p_restaurant_id uuid,
  p_display_name text,
  p_points_cost integer,
  p_min_order_subtotal numeric,
  p_active boolean,
  p_sort_order integer,
  p_product_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_display_name IS NULL OR length(trim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_display_name';
  END IF;
  IF p_points_cost IS NULL OR p_points_cost <= 0 THEN
    RAISE EXCEPTION 'invalid_points_cost';
  END IF;
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_restaurant';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.loyalty_rewards
      (restaurant_id, product_id, display_name, points_cost, min_order_subtotal, active, sort_order)
    VALUES
      (p_restaurant_id, p_product_id, trim(p_display_name), p_points_cost,
       COALESCE(p_min_order_subtotal, 0), COALESCE(p_active, true), COALESCE(p_sort_order, 0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.loyalty_rewards
       SET product_id          = p_product_id,
           display_name        = trim(p_display_name),
           points_cost         = p_points_cost,
           min_order_subtotal  = COALESCE(p_min_order_subtotal, 0),
           active              = COALESCE(p_active, true),
           sort_order          = COALESCE(p_sort_order, 0)
     WHERE id = p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'reward_not_found';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_loyalty_upsert_reward(uuid, uuid, text, integer, numeric, boolean, integer, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_loyalty_delete_reward(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.loyalty_rewards WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_loyalty_delete_reward(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_loyalty_list_rewards(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'restaurant_id', r.restaurant_id,
    'product_id', r.product_id,
    'product_name', p.name,
    'product_price', p.price,
    'display_name', r.display_name,
    'points_cost', r.points_cost,
    'min_order_subtotal', r.min_order_subtotal,
    'active', r.active,
    'sort_order', r.sort_order,
    'effective_cost_per_point',
       CASE WHEN p.price IS NOT NULL AND r.points_cost > 0
            THEN round((p.price / r.points_cost)::numeric, 4)
            ELSE NULL END
  ) ORDER BY r.sort_order, r.display_name), '[]'::jsonb)
  FROM public.loyalty_rewards r
  LEFT JOIN public.products p ON p.id = r.product_id
  WHERE r.restaurant_id = p_restaurant_id;
$$;
GRANT EXECUTE ON FUNCTION public.admin_loyalty_list_rewards(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_loyalty_adjust(
  p_phone text,
  p_points integer,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone   text;
  v_balance integer;
BEGIN
  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'note_required';
  END IF;
  IF p_points IS NULL OR p_points = 0 THEN
    RAISE EXCEPTION 'invalid_points';
  END IF;
  v_phone := public.normalize_phone(p_phone);
  IF v_phone IS NULL OR length(v_phone) < 10 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  INSERT INTO public.loyalty_accounts (phone, balance, total_earned)
  VALUES (v_phone, 0, 0)
  ON CONFLICT (phone) DO NOTHING;

  -- Trava conta
  SELECT balance INTO v_balance
    FROM public.loyalty_accounts WHERE phone = v_phone FOR UPDATE;

  IF p_points < 0 AND v_balance + p_points < 0 THEN
    RAISE EXCEPTION 'insufficient_points';
  END IF;

  INSERT INTO public.loyalty_transactions (phone, kind, points, admin_note)
  VALUES (v_phone, 'admin_adjust', p_points, trim(p_note));

  UPDATE public.loyalty_accounts
     SET balance      = balance + p_points,
         total_earned = total_earned + GREATEST(p_points, 0)
   WHERE phone = v_phone
   RETURNING balance INTO v_balance;

  RETURN jsonb_build_object('phone', v_phone, 'balance', v_balance);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_loyalty_adjust(text, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_loyalty_search_customer(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone   text;
  v_account record;
  v_history jsonb;
BEGIN
  v_phone := public.normalize_phone(p_phone);
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_account FROM public.loyalty_accounts WHERE phone = v_phone;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'phone', v_phone);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'kind', t.kind,
    'points', t.points,
    'order_id', t.order_id,
    'reward_id', t.reward_id,
    'admin_note', t.admin_note,
    'created_at', t.created_at
  ) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_history
  FROM public.loyalty_transactions t
  WHERE t.phone = v_phone
  LIMIT 100;

  RETURN jsonb_build_object(
    'found', true,
    'phone', v_account.phone,
    'balance', v_account.balance,
    'total_earned', v_account.total_earned,
    'last_customer_name', v_account.last_customer_name,
    'created_at', v_account.created_at,
    'history', v_history
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_loyalty_search_customer(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_loyalty_top_customers(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'phone', phone,
    'balance', balance,
    'total_earned', total_earned,
    'last_customer_name', last_customer_name,
    'updated_at', updated_at
  ) ORDER BY balance DESC, total_earned DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM public.loyalty_accounts
    ORDER BY balance DESC, total_earned DESC
    LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.admin_loyalty_top_customers(integer) TO anon, authenticated;

-- ============================================================================
-- 10) ESTENDER create_public_order com p_loyalty_reward_id NO FINAL
-- (preserva assinatura antiga via DEFAULT NULL no novo parâmetro)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_public_order(
  p_restaurant_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_service_type text,
  p_payment_method text,
  p_change_for numeric,
  p_address jsonb,
  p_items jsonb,
  p_note text,
  p_client_request_id text,
  p_loyalty_reward_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_prep_min int;
  v_buffer_min int;
  v_token uuid := gen_random_uuid();
  v_order_id uuid;
  v_customer_id uuid;
  v_items_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_total numeric := 0;
  v_normalized_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_pid uuid;
  v_qty int;
  v_pname text;
  v_pprice numeric;
  v_eta timestamptz;
  v_table_name text;
  v_auto_approve boolean;
  v_existing_order record;
  v_loyalty_enabled boolean;
  v_norm_phone text;
  v_reward record;
  v_account_balance integer;
BEGIN
  -- Idempotência
  IF p_client_request_id IS NOT NULL AND length(p_client_request_id) > 0 THEN
    SELECT id, public_token, status, total, estimated_ready_at
      INTO v_existing_order
    FROM public.orders
    WHERE channel = 'online'
      AND (delta_items->>'client_request_id') = p_client_request_id
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_existing_order.id,
        'public_token', v_existing_order.public_token,
        'status', v_existing_order.status,
        'auto_approved', v_existing_order.status <> 'pending_approval',
        'estimated_ready_at', v_existing_order.estimated_ready_at,
        'total', v_existing_order.total,
        'idempotent', true
      );
    END IF;
  END IF;

  SELECT id, default_prep_minutes, delivery_prep_buffer
    INTO v_restaurant_id, v_prep_min, v_buffer_min
  FROM public.restaurants WHERE slug = p_restaurant_slug;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_not_found';
  END IF;

  IF NOT public.is_restaurant_open(v_restaurant_id) THEN
    RAISE EXCEPTION 'restaurant_closed';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;
  IF p_customer_phone IS NULL OR length(regexp_replace(p_customer_phone, '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF p_service_type NOT IN ('delivery','pickup','dine_in') THEN
    RAISE EXCEPTION 'invalid_service_type';
  END IF;

  IF p_service_type = 'delivery' THEN
    IF p_address IS NULL OR coalesce(p_address->>'neighborhood','') = '' THEN
      RAISE EXCEPTION 'invalid_address';
    END IF;
    v_delivery_fee := 5.00;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_pid := nullif(v_item->>'product_id','')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_product_id';
    END;
    IF v_pid IS NULL THEN RAISE EXCEPTION 'invalid_product_id'; END IF;

    v_qty := coalesce((v_item->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 999 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

    SELECT name, price INTO v_pname, v_pprice
    FROM public.products
    WHERE id = v_pid AND active = true
      AND is_available_online = true
      AND is_sold_out = false;

    IF v_pname IS NULL THEN
      RAISE EXCEPTION 'product_unavailable: %', v_pid;
    END IF;

    v_items_subtotal := v_items_subtotal + (v_pprice * v_qty);
    v_normalized_items := v_normalized_items || jsonb_build_object(
      'product_id', v_pid,
      'product_name', v_pname,
      'product_price', v_pprice,
      'quantity', v_qty,
      'note', nullif(v_item->>'note','')
    );
  END LOOP;

  v_total := v_items_subtotal + v_delivery_fee;
  v_customer_id := public.get_or_create_customer(p_customer_phone, p_customer_name);

  SELECT (value = 'true') INTO v_auto_approve
  FROM public.settings WHERE key = 'auto_approve_online_orders';
  v_auto_approve := coalesce(v_auto_approve, true);

  v_eta := now() + make_interval(mins => coalesce(v_prep_min, 25)
              + CASE WHEN p_service_type = 'delivery' THEN coalesce(v_buffer_min, 10) ELSE 0 END);

  v_table_name := CASE p_service_type
    WHEN 'delivery' THEN 'Delivery #' || substr(v_token::text, 1, 6)
    WHEN 'pickup'   THEN 'Retirada #' || substr(v_token::text, 1, 6)
    ELSE 'Online #' || substr(v_token::text, 1, 6)
  END;

  INSERT INTO public.orders (
    table_name, channel, status, service_type,
    customer_id, customer_name_snapshot, customer_phone_snapshot,
    delivery_address, delivery_fee, payment_method, change_for,
    public_token, total, estimated_ready_at,
    approved_at, approved_by, delta_items
  ) VALUES (
    v_table_name, 'online', 'new', p_service_type,
    v_customer_id, p_customer_name, p_customer_phone,
    CASE WHEN p_service_type='delivery' THEN p_address ELSE NULL END,
    v_delivery_fee, p_payment_method, p_change_for,
    v_token, v_total, v_eta,
    CASE WHEN v_auto_approve THEN now() ELSE NULL END,
    CASE WHEN v_auto_approve THEN 'auto' ELSE NULL END,
    jsonb_build_object(
      'client_request_id', p_client_request_id,
      'note', p_note
    )
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, subtotal, note)
  SELECT v_order_id,
         (it->>'product_id')::uuid,
         it->>'product_name',
         (it->>'product_price')::numeric,
         (it->>'quantity')::int,
         (it->>'product_price')::numeric * (it->>'quantity')::int,
         it->>'note'
  FROM jsonb_array_elements(v_normalized_items) AS it;

  -- ===================== RESGATE DE BRINDE =====================
  IF p_loyalty_reward_id IS NOT NULL THEN
    v_loyalty_enabled := public._loyalty_setting_bool('loyalty_enabled', false);
    IF NOT v_loyalty_enabled THEN
      RAISE EXCEPTION 'loyalty_disabled';
    END IF;

    v_norm_phone := public.normalize_phone(p_customer_phone);
    IF v_norm_phone IS NULL OR length(v_norm_phone) < 10 THEN
      RAISE EXCEPTION 'phone_required';
    END IF;

    SELECT * INTO v_reward
      FROM public.loyalty_rewards
     WHERE id = p_loyalty_reward_id AND restaurant_id = v_restaurant_id;

    IF NOT FOUND OR NOT v_reward.active THEN
      RAISE EXCEPTION 'reward_inactive';
    END IF;

    IF v_items_subtotal < v_reward.min_order_subtotal THEN
      RAISE EXCEPTION 'min_subtotal_not_met';
    END IF;

    -- Garante account
    INSERT INTO public.loyalty_accounts (phone, balance, total_earned, last_customer_name)
    VALUES (v_norm_phone, 0, 0, p_customer_name)
    ON CONFLICT (phone) DO UPDATE
      SET last_customer_name = COALESCE(EXCLUDED.last_customer_name, public.loyalty_accounts.last_customer_name);

    -- Trava conta
    SELECT balance INTO v_account_balance
      FROM public.loyalty_accounts WHERE phone = v_norm_phone FOR UPDATE;

    IF v_account_balance < v_reward.points_cost THEN
      RAISE EXCEPTION 'insufficient_points';
    END IF;

    -- Debita
    UPDATE public.loyalty_accounts
       SET balance = balance - v_reward.points_cost
     WHERE phone = v_norm_phone;

    INSERT INTO public.loyalty_transactions (phone, order_id, kind, points, reward_id)
    VALUES (v_norm_phone, v_order_id, 'redeem', -v_reward.points_cost, v_reward.id);

    -- Item brinde no pedido (R$ 0,00)
    INSERT INTO public.order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
    VALUES (v_order_id, v_reward.product_id, '[BRINDE] ' || v_reward.display_name, 0, 1, 0);
  END IF;
  -- =============================================================

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'new', 'public_checkout', 'Pedido criado pelo cardápio público');

  IF v_auto_approve THEN
    PERFORM public.enqueue_print_job(
      v_order_id,
      'order',
      jsonb_build_object('source', 'public_checkout', 'service_type', p_service_type)
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'public_token', v_token,
    'status', 'new',
    'auto_approved', v_auto_approve,
    'estimated_ready_at', v_eta,
    'total', v_total,
    'idempotent', false
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_public_order(text, text, text, text, text, numeric, jsonb, jsonb, text, text, uuid) TO anon, authenticated;