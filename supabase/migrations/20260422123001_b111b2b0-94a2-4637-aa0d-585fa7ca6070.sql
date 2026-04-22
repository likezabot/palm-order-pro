-- Tabela de itens de estoque
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  aliases text[] NOT NULL DEFAULT '{}',
  category text NOT NULL DEFAULT 'outros',
  unit text NOT NULL DEFAULT 'unidade',
  current_stock numeric NOT NULL DEFAULT 0,
  min_stock numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_items_active ON public.inventory_items(is_active);
CREATE INDEX idx_inventory_items_aliases ON public.inventory_items USING GIN(aliases);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_items_select" ON public.inventory_items FOR SELECT USING (true);
CREATE POLICY "inventory_items_insert" ON public.inventory_items FOR INSERT WITH CHECK (true);
CREATE POLICY "inventory_items_update" ON public.inventory_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "inventory_items_delete" ON public.inventory_items FOR DELETE USING (true);

CREATE TRIGGER inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de movimentações
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('in','out','adjustment')),
  quantity numeric NOT NULL,
  note text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','telegram','pdv','system')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_movements_item_created ON public.inventory_movements(item_id, created_at DESC);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_movements_select" ON public.inventory_movements FOR SELECT USING (true);
CREATE POLICY "inventory_movements_insert" ON public.inventory_movements FOR INSERT WITH CHECK (true);
CREATE POLICY "inventory_movements_update" ON public.inventory_movements FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "inventory_movements_delete" ON public.inventory_movements FOR DELETE USING (true);

-- Função: aplicar movimentação atômica
CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  p_item_id uuid,
  p_type text,
  p_quantity numeric,
  p_note text DEFAULT NULL,
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current numeric;
  v_new numeric;
BEGIN
  IF p_type NOT IN ('in','out','adjustment') THEN
    RAISE EXCEPTION 'invalid_movement_type: %', p_type;
  END IF;
  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  SELECT current_stock INTO v_current
  FROM public.inventory_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;

  v_new := CASE p_type
    WHEN 'in' THEN v_current + p_quantity
    WHEN 'out' THEN v_current - p_quantity
    WHEN 'adjustment' THEN p_quantity
  END;

  UPDATE public.inventory_items
  SET current_stock = v_new,
      updated_at = now()
  WHERE id = p_item_id;

  INSERT INTO public.inventory_movements (item_id, movement_type, quantity, note, source)
  VALUES (p_item_id, p_type, p_quantity, NULLIF(trim(coalesce(p_note,'')),''), coalesce(p_source,'manual'));

  RETURN jsonb_build_object('new_stock', v_new, 'previous_stock', v_current);
END;
$$;

-- Função: localizar item por texto (slug ou alias) — preparada pro bot
CREATE OR REPLACE FUNCTION public.find_inventory_item_by_text(p_text text)
RETURNS SETOF public.inventory_items
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_norm text;
BEGIN
  v_norm := lower(trim(coalesce(p_text,'')));
  -- remove acentos básicos
  v_norm := translate(v_norm,
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn');

  IF v_norm = '' THEN RETURN; END IF;

  RETURN QUERY
  SELECT * FROM public.inventory_items
  WHERE is_active = true
    AND (slug = v_norm OR v_norm = ANY(aliases))
  LIMIT 1;
END;
$$;