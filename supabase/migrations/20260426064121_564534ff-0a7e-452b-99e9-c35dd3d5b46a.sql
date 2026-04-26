-- 1) Coluna nova
ALTER TABLE public.public_menu_settings
  ADD COLUMN IF NOT EXISTS category_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) RPC atualizada (adiciona p_category_overrides ao final)
CREATE OR REPLACE FUNCTION public.admin_update_public_menu_settings(
  p_restaurant_id uuid,
  p_layout_mode text DEFAULT NULL,
  p_accent_color text DEFAULT NULL,
  p_banner_url text DEFAULT NULL,
  p_welcome_message text DEFAULT NULL,
  p_show_descriptions boolean DEFAULT NULL,
  p_show_product_images boolean DEFAULT NULL,
  p_featured_style text DEFAULT NULL,
  p_category_order text[] DEFAULT NULL,
  p_hidden_category_slugs text[] DEFAULT NULL,
  p_image_aspect text DEFAULT NULL,
  p_clear_banner_url boolean DEFAULT false,
  p_clear_welcome_message boolean DEFAULT false,
  p_hero_title text DEFAULT NULL,
  p_hero_subtitle text DEFAULT NULL,
  p_hero_alignment text DEFAULT NULL,
  p_show_logo boolean DEFAULT NULL,
  p_show_open_status_badge boolean DEFAULT NULL,
  p_show_whatsapp_fab boolean DEFAULT NULL,
  p_show_search_bar boolean DEFAULT NULL,
  p_show_featured_section boolean DEFAULT NULL,
  p_show_category_nav boolean DEFAULT NULL,
  p_show_categories_section_title boolean DEFAULT NULL,
  p_categories_section_title text DEFAULT NULL,
  p_show_hero_banner_overlay boolean DEFAULT NULL,
  p_show_welcome_message_card boolean DEFAULT NULL,
  p_section_order text[] DEFAULT NULL,
  p_background_color text DEFAULT NULL,
  p_surface_color text DEFAULT NULL,
  p_text_color text DEFAULT NULL,
  p_muted_text_color text DEFAULT NULL,
  p_button_style text DEFAULT NULL,
  p_card_style text DEFAULT NULL,
  p_radius_scale text DEFAULT NULL,
  p_clear_hero_title boolean DEFAULT false,
  p_clear_hero_subtitle boolean DEFAULT false,
  p_clear_background_color boolean DEFAULT false,
  p_clear_surface_color boolean DEFAULT false,
  p_clear_text_color boolean DEFAULT false,
  p_clear_muted_text_color boolean DEFAULT false,
  p_category_overrides jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hex_re constant text := '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$';
  allowed_section text[] := ARRAY['hero','featured','categories','welcome'];
  s text;
  k text;
  v jsonb;
  layout_v text;
  aspect_v text;
  cardstyle_v text;
BEGIN
  IF p_layout_mode IS NOT NULL AND p_layout_mode NOT IN ('list','grid') THEN
    RAISE EXCEPTION 'invalid layout_mode';
  END IF;
  IF p_featured_style IS NOT NULL AND p_featured_style NOT IN ('carousel','grid','hidden') THEN
    RAISE EXCEPTION 'invalid featured_style';
  END IF;
  IF p_image_aspect IS NOT NULL AND p_image_aspect NOT IN ('square','wide','tall') THEN
    RAISE EXCEPTION 'invalid image_aspect';
  END IF;
  IF p_hero_alignment IS NOT NULL AND p_hero_alignment NOT IN ('left','center') THEN
    RAISE EXCEPTION 'invalid hero_alignment';
  END IF;
  IF p_button_style IS NOT NULL AND p_button_style NOT IN ('solid','outline','soft') THEN
    RAISE EXCEPTION 'invalid button_style';
  END IF;
  IF p_card_style IS NOT NULL AND p_card_style NOT IN ('flat','elevated') THEN
    RAISE EXCEPTION 'invalid card_style';
  END IF;
  IF p_radius_scale IS NOT NULL AND p_radius_scale NOT IN ('md','lg','xl') THEN
    RAISE EXCEPTION 'invalid radius_scale';
  END IF;
  IF p_accent_color IS NOT NULL AND p_accent_color !~ hex_re THEN
    RAISE EXCEPTION 'invalid accent_color';
  END IF;
  IF p_background_color IS NOT NULL AND p_background_color !~ hex_re THEN
    RAISE EXCEPTION 'invalid background_color';
  END IF;
  IF p_surface_color IS NOT NULL AND p_surface_color !~ hex_re THEN
    RAISE EXCEPTION 'invalid surface_color';
  END IF;
  IF p_text_color IS NOT NULL AND p_text_color !~ hex_re THEN
    RAISE EXCEPTION 'invalid text_color';
  END IF;
  IF p_muted_text_color IS NOT NULL AND p_muted_text_color !~ hex_re THEN
    RAISE EXCEPTION 'invalid muted_text_color';
  END IF;
  IF p_welcome_message IS NOT NULL AND char_length(p_welcome_message) > 500 THEN
    RAISE EXCEPTION 'welcome_message too long';
  END IF;
  IF p_hero_title IS NOT NULL AND char_length(p_hero_title) > 80 THEN
    RAISE EXCEPTION 'hero_title too long';
  END IF;
  IF p_hero_subtitle IS NOT NULL AND char_length(p_hero_subtitle) > 160 THEN
    RAISE EXCEPTION 'hero_subtitle too long';
  END IF;
  IF p_categories_section_title IS NOT NULL AND char_length(p_categories_section_title) > 40 THEN
    RAISE EXCEPTION 'categories_section_title too long';
  END IF;

  IF p_section_order IS NOT NULL THEN
    IF array_length(p_section_order, 1) IS NULL OR array_length(p_section_order, 1) > 8 THEN
      RAISE EXCEPTION 'invalid section_order';
    END IF;
    FOREACH s IN ARRAY p_section_order LOOP
      IF NOT (s = ANY(allowed_section)) THEN
        RAISE EXCEPTION 'invalid section_order entry: %', s;
      END IF;
    END LOOP;
  END IF;

  -- Validação de category_overrides: deve ser objeto, com até 200 chaves,
  -- e cada valor um objeto contendo apenas as chaves layout/image_aspect/card_style com valores aceitos.
  IF p_category_overrides IS NOT NULL THEN
    IF jsonb_typeof(p_category_overrides) <> 'object' THEN
      RAISE EXCEPTION 'invalid category_overrides';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_category_overrides)) > 200 THEN
      RAISE EXCEPTION 'too many category_overrides';
    END IF;
    FOR k, v IN SELECT * FROM jsonb_each(p_category_overrides) LOOP
      IF jsonb_typeof(v) <> 'object' THEN
        RAISE EXCEPTION 'invalid category_overrides entry for %', k;
      END IF;
      layout_v := v->>'layout';
      aspect_v := v->>'image_aspect';
      cardstyle_v := v->>'card_style';
      IF layout_v IS NOT NULL AND layout_v NOT IN ('list','grid-2','grid-3') THEN
        RAISE EXCEPTION 'invalid layout in override %', k;
      END IF;
      IF aspect_v IS NOT NULL AND aspect_v NOT IN ('square','wide','tall') THEN
        RAISE EXCEPTION 'invalid image_aspect in override %', k;
      END IF;
      IF cardstyle_v IS NOT NULL AND cardstyle_v NOT IN ('compact','detailed') THEN
        RAISE EXCEPTION 'invalid card_style in override %', k;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.public_menu_settings (restaurant_id)
  VALUES (p_restaurant_id)
  ON CONFLICT (restaurant_id) DO NOTHING;

  UPDATE public.public_menu_settings SET
    layout_mode               = COALESCE(p_layout_mode, layout_mode),
    accent_color              = COALESCE(p_accent_color, accent_color),
    banner_url                = CASE WHEN p_clear_banner_url THEN NULL ELSE COALESCE(p_banner_url, banner_url) END,
    welcome_message           = CASE WHEN p_clear_welcome_message THEN NULL ELSE COALESCE(p_welcome_message, welcome_message) END,
    show_descriptions         = COALESCE(p_show_descriptions, show_descriptions),
    show_product_images       = COALESCE(p_show_product_images, show_product_images),
    featured_style            = COALESCE(p_featured_style, featured_style),
    category_order            = COALESCE(p_category_order, category_order),
    hidden_category_slugs     = COALESCE(p_hidden_category_slugs, hidden_category_slugs),
    image_aspect              = COALESCE(p_image_aspect, image_aspect),
    hero_title                = CASE WHEN p_clear_hero_title THEN NULL ELSE COALESCE(p_hero_title, hero_title) END,
    hero_subtitle             = CASE WHEN p_clear_hero_subtitle THEN NULL ELSE COALESCE(p_hero_subtitle, hero_subtitle) END,
    hero_alignment            = COALESCE(p_hero_alignment, hero_alignment),
    show_logo                 = COALESCE(p_show_logo, show_logo),
    show_open_status_badge    = COALESCE(p_show_open_status_badge, show_open_status_badge),
    show_whatsapp_fab         = COALESCE(p_show_whatsapp_fab, show_whatsapp_fab),
    show_search_bar           = COALESCE(p_show_search_bar, show_search_bar),
    show_featured_section     = COALESCE(p_show_featured_section, show_featured_section),
    show_category_nav         = COALESCE(p_show_category_nav, show_category_nav),
    show_categories_section_title = COALESCE(p_show_categories_section_title, show_categories_section_title),
    categories_section_title  = COALESCE(p_categories_section_title, categories_section_title),
    show_hero_banner_overlay  = COALESCE(p_show_hero_banner_overlay, show_hero_banner_overlay),
    show_welcome_message_card = COALESCE(p_show_welcome_message_card, show_welcome_message_card),
    section_order             = COALESCE(p_section_order, section_order),
    background_color          = CASE WHEN p_clear_background_color THEN NULL ELSE COALESCE(p_background_color, background_color) END,
    surface_color             = CASE WHEN p_clear_surface_color THEN NULL ELSE COALESCE(p_surface_color, surface_color) END,
    text_color                = CASE WHEN p_clear_text_color THEN NULL ELSE COALESCE(p_text_color, text_color) END,
    muted_text_color          = CASE WHEN p_clear_muted_text_color THEN NULL ELSE COALESCE(p_muted_text_color, muted_text_color) END,
    button_style              = COALESCE(p_button_style, button_style),
    card_style                = COALESCE(p_card_style, card_style),
    radius_scale              = COALESCE(p_radius_scale, radius_scale),
    category_overrides        = COALESCE(p_category_overrides, category_overrides),
    updated_at                = now()
  WHERE restaurant_id = p_restaurant_id;
END;
$$;

-- 3) Reordenar produtos em lote
CREATE OR REPLACE FUNCTION public.admin_reorder_products(
  p_ids uuid[],
  p_orders int[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i int;
BEGIN
  IF p_ids IS NULL OR p_orders IS NULL THEN
    RAISE EXCEPTION 'ids/orders required';
  END IF;
  IF array_length(p_ids, 1) IS DISTINCT FROM array_length(p_orders, 1) THEN
    RAISE EXCEPTION 'ids/orders length mismatch';
  END IF;
  IF COALESCE(array_length(p_ids, 1), 0) > 1000 THEN
    RAISE EXCEPTION 'too many products';
  END IF;
  FOR i IN 1..array_length(p_ids, 1) LOOP
    UPDATE public.products
       SET display_order = p_orders[i]
     WHERE id = p_ids[i];
  END LOOP;
END;
$$;