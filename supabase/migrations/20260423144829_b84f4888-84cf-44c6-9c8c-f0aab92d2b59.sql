
-- Estoque: criar/editar item
CREATE OR REPLACE FUNCTION public.admin_upsert_inventory_item(
  p_pin text,
  p_id uuid,
  p_name text,
  p_slug text,
  p_category text,
  p_unit text,
  p_aliases text[] DEFAULT '{}',
  p_min_stock numeric DEFAULT 0,
  p_is_active boolean DEFAULT true,
  p_product_id uuid DEFAULT NULL,
  p_current_stock numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM _require_manager_pin(p_pin);
  IF p_id IS NULL THEN
    INSERT INTO inventory_items(name, slug, category, unit, aliases, min_stock, is_active, product_id, current_stock)
    VALUES (p_name, p_slug, p_category, p_unit, p_aliases, p_min_stock, p_is_active, p_product_id, p_current_stock)
    RETURNING id INTO v_id;
  ELSE
    UPDATE inventory_items
       SET name=p_name, slug=p_slug, category=p_category, unit=p_unit,
           aliases=p_aliases, min_stock=p_min_stock, is_active=p_is_active,
           product_id=p_product_id, updated_at=now()
     WHERE id=p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- Estoque: importar lote do cardápio
CREATE OR REPLACE FUNCTION public.admin_bulk_import_inventory(
  p_pin text,
  p_items jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_item jsonb;
BEGIN
  PERFORM _require_manager_pin(p_pin);
  FOR v_item IN SELECT jsonb_array_elements(p_items) LOOP
    INSERT INTO inventory_items(name, slug, category, unit, aliases, current_stock, min_stock, is_active, product_id)
    VALUES (
      v_item->>'name',
      v_item->>'slug',
      v_item->>'category',
      COALESCE(v_item->>'unit','unidade'),
      COALESCE((SELECT array_agg(value::text) FROM jsonb_array_elements_text(v_item->'aliases')), '{}'::text[]),
      COALESCE((v_item->>'current_stock')::numeric, 0),
      COALESCE((v_item->>'min_stock')::numeric, 0),
      COALESCE((v_item->>'is_active')::boolean, true),
      NULLIF(v_item->>'product_id','')::uuid
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Receitas
CREATE OR REPLACE FUNCTION public.admin_set_recipe(
  p_pin text,
  p_product_id uuid,
  p_ingredient_product_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM _require_manager_pin(p_pin);
  INSERT INTO product_recipes(product_id, ingredient_product_id)
  VALUES (p_product_id, p_ingredient_product_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_recipe(
  p_pin text,
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_manager_pin(p_pin);
  DELETE FROM product_recipes WHERE id = p_id;
END;
$$;

-- Produtos: toggle ativo (sem PIN; garçom pode marcar esgotado)
CREATE OR REPLACE FUNCTION public.toggle_product_active(
  p_id uuid,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products SET active = p_active WHERE id = p_id;
END;
$$;

-- Produtos: bulk active (com PIN)
CREATE OR REPLACE FUNCTION public.admin_bulk_set_active(
  p_pin text,
  p_ids uuid[],
  p_active boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  PERFORM _require_manager_pin(p_pin);
  UPDATE products SET active = p_active WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Produtos: bulk price (com PIN)
CREATE OR REPLACE FUNCTION public.admin_bulk_set_price(
  p_pin text,
  p_updates jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row jsonb;
BEGIN
  PERFORM _require_manager_pin(p_pin);
  FOR v_row IN SELECT jsonb_array_elements(p_updates) LOOP
    UPDATE products
       SET price = (v_row->>'price')::numeric
     WHERE id = (v_row->>'id')::uuid
       AND (v_row->>'price')::numeric >= 0;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_upsert_inventory_item(text,uuid,text,text,text,text,text[],numeric,boolean,uuid,numeric) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_bulk_import_inventory(text,jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_set_recipe(text,uuid,uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_delete_recipe(text,uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_bulk_set_active(text,uuid[],boolean) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_bulk_set_price(text,jsonb) FROM public;

GRANT EXECUTE ON FUNCTION public.admin_upsert_inventory_item(text,uuid,text,text,text,text,text[],numeric,boolean,uuid,numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_import_inventory(text,jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_recipe(text,uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_recipe(text,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_product_active(uuid,boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_set_active(text,uuid[],boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_set_price(text,jsonb) TO anon, authenticated;
