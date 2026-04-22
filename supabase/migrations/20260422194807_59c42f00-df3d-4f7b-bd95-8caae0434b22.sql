-- 1) Sync linked items to their product's category
UPDATE public.inventory_items i
SET category = p.category,
    updated_at = now()
FROM public.products p
WHERE i.product_id = p.id
  AND i.category IS DISTINCT FROM p.category;

-- 2) Unlinked "carnes" → "espetos" (matéria-prima dos espetos)
UPDATE public.inventory_items
SET category = 'espetos',
    updated_at = now()
WHERE product_id IS NULL
  AND category = 'carnes';

-- 3) Trigger: keep category in sync with linked product
CREATE OR REPLACE FUNCTION public.sync_inventory_category_from_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat text;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT category INTO v_cat FROM public.products WHERE id = NEW.product_id;
    IF v_cat IS NOT NULL THEN
      NEW.category := v_cat;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_inventory_category ON public.inventory_items;
CREATE TRIGGER trg_sync_inventory_category
BEFORE INSERT OR UPDATE OF product_id, category ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_inventory_category_from_product();