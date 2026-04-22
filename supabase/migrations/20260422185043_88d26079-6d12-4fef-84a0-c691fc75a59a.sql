-- Função que processa baixa/devolução de estoque baseada em mudanças em order_items
CREATE OR REPLACE FUNCTION public.auto_inventory_from_order_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
  v_order_status text;
  v_delta numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NULL OR NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
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

    -- Só devolve se o pedido pai não está pago (e ainda existe)
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
    -- Só processa se quantidade ou product_id mudou
    IF NEW.product_id IS NOT DISTINCT FROM OLD.product_id
       AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN
      RETURN NEW;
    END IF;

    -- Devolve o antigo
    IF OLD.product_id IS NOT NULL AND OLD.quantity > 0 THEN
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

    -- Aplica o novo
    IF NEW.product_id IS NOT NULL AND NEW.quantity > 0 THEN
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

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_auto_inventory_ins ON public.order_items;
DROP TRIGGER IF EXISTS trg_order_items_auto_inventory_del ON public.order_items;
DROP TRIGGER IF EXISTS trg_order_items_auto_inventory_upd ON public.order_items;

CREATE TRIGGER trg_order_items_auto_inventory_ins
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.auto_inventory_from_order_items();

CREATE TRIGGER trg_order_items_auto_inventory_del
AFTER DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.auto_inventory_from_order_items();

CREATE TRIGGER trg_order_items_auto_inventory_upd
AFTER UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.auto_inventory_from_order_items();