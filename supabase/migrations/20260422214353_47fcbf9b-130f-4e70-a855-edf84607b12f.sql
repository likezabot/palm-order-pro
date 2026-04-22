-- 1) Blindar apply_inventory_movement contra source inválido
CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  p_item_id uuid,
  p_type text,
  p_quantity numeric,
  p_note text DEFAULT NULL::text,
  p_source text DEFAULT 'manual'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current numeric;
  v_new numeric;
  v_product_id uuid;
  v_product_active boolean;
  v_item_name text;
  v_source text;
BEGIN
  IF p_type NOT IN ('in','out','adjustment') THEN
    RAISE EXCEPTION 'invalid_movement_type: %', p_type;
  END IF;
  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  -- Normaliza source: qualquer valor fora do conjunto permitido vira 'system'
  v_source := coalesce(p_source, 'manual');
  IF v_source NOT IN ('manual','telegram','pdv','system') THEN
    v_source := 'system';
  END IF;

  SELECT current_stock, product_id, name INTO v_current, v_product_id, v_item_name
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
  VALUES (p_item_id, p_type, p_quantity, NULLIF(trim(coalesce(p_note,'')),''), v_source);

  v_product_active := NULL;
  IF v_product_id IS NOT NULL THEN
    SELECT active INTO v_product_active FROM public.products WHERE id = v_product_id;
  END IF;

  RETURN jsonb_build_object(
    'new_stock', v_new,
    'previous_stock', v_current,
    'item_name', v_item_name,
    'linked_product_id', v_product_id,
    'linked_product_active', v_product_active
  );
END;
$function$;

-- 2) Corrigir trigger de baixa automática para usar source 'system'
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
            'system');

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
            'system');

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
                  'system');
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
                  'system');
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;