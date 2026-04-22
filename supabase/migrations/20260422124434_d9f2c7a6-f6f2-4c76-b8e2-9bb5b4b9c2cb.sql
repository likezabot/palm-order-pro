-- Add product_id link to inventory_items
ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS product_id uuid NULL;

-- Unique partial index: a menu product can be linked to at most one inventory item
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_product_id_unique
ON public.inventory_items (product_id)
WHERE product_id IS NOT NULL;

-- Update apply_inventory_movement to return linked product info
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
BEGIN
  IF p_type NOT IN ('in','out','adjustment') THEN
    RAISE EXCEPTION 'invalid_movement_type: %', p_type;
  END IF;
  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
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
  VALUES (p_item_id, p_type, p_quantity, NULLIF(trim(coalesce(p_note,'')),''), coalesce(p_source,'manual'));

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