-- 1) Nova tabela product_recipes
CREATE TABLE IF NOT EXISTS public.product_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  ingredient_product_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, ingredient_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_recipes_product ON public.product_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_ingredient ON public.product_recipes(ingredient_product_id);

ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_recipes_select ON public.product_recipes;
DROP POLICY IF EXISTS product_recipes_insert ON public.product_recipes;
DROP POLICY IF EXISTS product_recipes_update ON public.product_recipes;
DROP POLICY IF EXISTS product_recipes_delete ON public.product_recipes;

CREATE POLICY product_recipes_select ON public.product_recipes FOR SELECT USING (true);
CREATE POLICY product_recipes_insert ON public.product_recipes FOR INSERT WITH CHECK (true);
CREATE POLICY product_recipes_update ON public.product_recipes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY product_recipes_delete ON public.product_recipes FOR DELETE USING (true);

-- 2) Soft-delete dos inventory_items de refeições
UPDATE public.inventory_items
SET is_active = false,
    updated_at = now()
WHERE category = 'refeicoes' AND is_active = true;

-- 3) Atualiza trigger para ignorar refeições (consultando categoria do produto)
CREATE OR REPLACE FUNCTION public.auto_inventory_from_order_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item_id uuid;
  v_order_status text;
  v_old_cat text;
  v_new_cat text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NULL OR NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
      RETURN NEW;
    END IF;

    SELECT category INTO v_new_cat FROM public.products WHERE id = NEW.product_id;
    IF v_new_cat = 'refeicoes' THEN
      RETURN NEW;
    END IF;

    SELECT id INTO v_item_id
    FROM public.inventory_items
    WHERE product_id = NEW.product_id AND is_active = true
    LIMIT 1;

    IF v_item_id IS NULL THEN
      RETURN NEW;
    END IF;

    UPDATE public.inventory_items
    SET current_stock = current_stock - NEW.quantity,
        updated_at = now()
    WHERE id = v_item_id;

    INSERT INTO public.inventory_movements (item_id, movement_type, quantity, note, source)
    VALUES (v_item_id, 'out', NEW.quantity,
            'Pedido auto: ' || COALESCE(NEW.product_name, ''),
            'order:auto');

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NULL OR OLD.quantity IS NULL OR OLD.quantity <= 0 THEN
      RETURN OLD;
    END IF;

    SELECT category INTO v_old_cat FROM public.products WHERE id = OLD.product_id;
    IF v_old_cat = 'refeicoes' THEN
      RETURN OLD;
    END IF;

    SELECT status INTO v_order_status FROM public.orders WHERE id = OLD.order_id;
    IF v_order_status IS NULL OR v_order_status = 'paid' THEN
      RETURN OLD;
    END IF;

    SELECT id INTO v_item_id
    FROM public.inventory_items
    WHERE product_id = OLD.product_id AND is_active = true
    LIMIT 1;

    IF v_item_id IS NULL THEN
      RETURN OLD;
    END IF;

    UPDATE public.inventory_items
    SET current_stock = current_stock + OLD.quantity,
        updated_at = now()
    WHERE id = v_item_id;

    INSERT INTO public.inventory_movements (item_id, movement_type, quantity, note, source)
    VALUES (v_item_id, 'in', OLD.quantity,
            'Pedido auto-revert: ' || COALESCE(OLD.product_name, ''),
            'order:auto-revert');

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.product_id IS NOT DISTINCT FROM OLD.product_id
       AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN
      RETURN NEW;
    END IF;

    -- Devolve o antigo (se não for refeição)
    IF OLD.product_id IS NOT NULL AND OLD.quantity > 0 THEN
      SELECT category INTO v_old_cat FROM public.products WHERE id = OLD.product_id;
      IF v_old_cat IS DISTINCT FROM 'refeicoes' THEN
        SELECT id INTO v_item_id
        FROM public.inventory_items
        WHERE product_id = OLD.product_id AND is_active = true
        LIMIT 1;

        IF v_item_id IS NOT NULL THEN
          UPDATE public.inventory_items
          SET current_stock = current_stock + OLD.quantity,
              updated_at = now()
          WHERE id = v_item_id;

          INSERT INTO public.inventory_movements (item_id, movement_type, quantity, note, source)
          VALUES (v_item_id, 'in', OLD.quantity,
                  'Pedido auto-edit revert: ' || COALESCE(OLD.product_name, ''),
                  'order:auto-revert');
        END IF;
      END IF;
    END IF;

    -- Aplica o novo (se não for refeição)
    IF NEW.product_id IS NOT NULL AND NEW.quantity > 0 THEN
      SELECT category INTO v_new_cat FROM public.products WHERE id = NEW.product_id;
      IF v_new_cat IS DISTINCT FROM 'refeicoes' THEN
        SELECT id INTO v_item_id
        FROM public.inventory_items
        WHERE product_id = NEW.product_id AND is_active = true
        LIMIT 1;

        IF v_item_id IS NOT NULL THEN
          UPDATE public.inventory_items
          SET current_stock = current_stock - NEW.quantity,
              updated_at = now()
          WHERE id = v_item_id;

          INSERT INTO public.inventory_movements (item_id, movement_type, quantity, note, source)
          VALUES (v_item_id, 'out', NEW.quantity,
                  'Pedido auto-edit: ' || COALESCE(NEW.product_name, ''),
                  'order:auto');
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;

-- 4) Seed: Janta de costela bovina → Costela de boi (borboleta)
INSERT INTO public.product_recipes (product_id, ingredient_product_id)
SELECT j.id, c.id
FROM public.products j
CROSS JOIN public.products c
WHERE lower(j.name) LIKE '%janta%costela%'
  AND lower(c.name) LIKE '%costela%boi%'
  AND j.id <> c.id
ON CONFLICT DO NOTHING;