
-- ============================================================
-- Fase 6: public_menu_settings (somente apresentação visual)
-- Sem impacto em pedido/preço/impressão.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.public_menu_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  layout_mode text NOT NULL DEFAULT 'list' CHECK (layout_mode IN ('list','grid')),
  accent_color text NOT NULL DEFAULT '#E25822',
  banner_url text,
  welcome_message text,
  show_descriptions boolean NOT NULL DEFAULT true,
  show_product_images boolean NOT NULL DEFAULT true,
  featured_style text NOT NULL DEFAULT 'carousel' CHECK (featured_style IN ('carousel','grid','hidden')),
  category_order text[] NOT NULL DEFAULT '{}',
  hidden_category_slugs text[] NOT NULL DEFAULT '{}',
  image_aspect text NOT NULL DEFAULT 'square' CHECK (image_aspect IN ('square','wide','tall')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_menu_settings_accent_hex
    CHECK (accent_color ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')
);

ALTER TABLE public.public_menu_settings ENABLE ROW LEVEL SECURITY;

-- Leitura pública (cardápio público precisa ler)
DROP POLICY IF EXISTS public_menu_settings_select ON public.public_menu_settings;
CREATE POLICY public_menu_settings_select
  ON public.public_menu_settings FOR SELECT
  USING (true);

-- Sem INSERT/UPDATE/DELETE direto: tudo via RPC SECURITY DEFINER

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public._public_menu_settings_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_menu_settings_touch ON public.public_menu_settings;
CREATE TRIGGER trg_public_menu_settings_touch
  BEFORE UPDATE ON public.public_menu_settings
  FOR EACH ROW EXECUTE FUNCTION public._public_menu_settings_touch();

-- ============================================================
-- RPC: upsert das settings (apenas visual)
-- Segue o padrão do admin_update_restaurant (sem PIN)
-- ============================================================
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
  p_clear_welcome_message boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validações
  IF p_accent_color IS NOT NULL AND p_accent_color !~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' THEN
    RAISE EXCEPTION 'accent_color inválido (use #RGB ou #RRGGBB)';
  END IF;

  IF p_layout_mode IS NOT NULL AND p_layout_mode NOT IN ('list','grid') THEN
    RAISE EXCEPTION 'layout_mode inválido';
  END IF;

  IF p_featured_style IS NOT NULL AND p_featured_style NOT IN ('carousel','grid','hidden') THEN
    RAISE EXCEPTION 'featured_style inválido';
  END IF;

  IF p_image_aspect IS NOT NULL AND p_image_aspect NOT IN ('square','wide','tall') THEN
    RAISE EXCEPTION 'image_aspect inválido';
  END IF;

  -- Limites de tamanho
  IF p_welcome_message IS NOT NULL AND length(p_welcome_message) > 500 THEN
    RAISE EXCEPTION 'welcome_message muito longa (máx 500)';
  END IF;
  IF p_banner_url IS NOT NULL AND length(p_banner_url) > 2000 THEN
    RAISE EXCEPTION 'banner_url muito longa';
  END IF;

  INSERT INTO public.public_menu_settings (restaurant_id)
  VALUES (p_restaurant_id)
  ON CONFLICT (restaurant_id) DO NOTHING;

  UPDATE public.public_menu_settings SET
    layout_mode = COALESCE(p_layout_mode, layout_mode),
    accent_color = COALESCE(p_accent_color, accent_color),
    banner_url = CASE WHEN p_clear_banner_url THEN NULL
                      WHEN p_banner_url IS NOT NULL THEN p_banner_url
                      ELSE banner_url END,
    welcome_message = CASE WHEN p_clear_welcome_message THEN NULL
                           WHEN p_welcome_message IS NOT NULL THEN p_welcome_message
                           ELSE welcome_message END,
    show_descriptions = COALESCE(p_show_descriptions, show_descriptions),
    show_product_images = COALESCE(p_show_product_images, show_product_images),
    featured_style = COALESCE(p_featured_style, featured_style),
    category_order = COALESCE(p_category_order, category_order),
    hidden_category_slugs = COALESCE(p_hidden_category_slugs, hidden_category_slugs),
    image_aspect = COALESCE(p_image_aspect, image_aspect)
  WHERE restaurant_id = p_restaurant_id;
END;
$$;

-- ============================================================
-- RPC: atualizar slug do restaurante (validado e único)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_restaurant_slug(
  p_restaurant_id uuid,
  p_new_slug text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_new_slug IS NULL OR p_new_slug !~ '^[a-z0-9-]+$' OR length(p_new_slug) < 2 OR length(p_new_slug) > 60 THEN
    RAISE EXCEPTION 'slug inválido (use letras minúsculas, números e hífen, 2-60 caracteres)';
  END IF;

  IF EXISTS (SELECT 1 FROM public.restaurants WHERE slug = p_new_slug AND id <> p_restaurant_id) THEN
    RAISE EXCEPTION 'slug já está em uso';
  END IF;

  UPDATE public.restaurants
  SET slug = p_new_slug, updated_at = now()
  WHERE id = p_restaurant_id;
END;
$$;

-- ============================================================
-- RPC: alternar apenas is_featured de um produto (rápido)
-- Não permite alterar mais nada.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_toggle_product_featured(
  p_product_id uuid,
  p_is_featured boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products
  SET is_featured = p_is_featured
  WHERE id = p_product_id;
END;
$$;

-- Seed: cria linha default para todos restaurantes existentes
INSERT INTO public.public_menu_settings (restaurant_id)
SELECT id FROM public.restaurants
ON CONFLICT (restaurant_id) DO NOTHING;
