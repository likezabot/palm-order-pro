/**
 * Helpers para o cardápio público (somente leitura).
 * Não importar de Palm/PDV/Admin.
 */
import { supabase } from "@/integrations/supabase/client";

export type Restaurant = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  hero_url: string | null;
  description: string | null;
  whatsapp_phone: string | null;
  is_open_override: "auto" | "open" | "closed";
  default_prep_minutes: number;
  delivery_prep_buffer: number;
};

export type BusinessHour = {
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

export type MenuCategory = {
  id: string;
  slug: string;
  name: string;
  display_order: number;
  active: boolean;
};

export type PublicProduct = {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string | null;
  image_url: string | null;
  is_featured: boolean;
  is_available_online: boolean;
  is_sold_out: boolean;
  display_order: number;
  active: boolean;
};

const RESTAURANT_COLUMNS =
  "id, slug, name, logo_url, hero_url, description, whatsapp_phone, is_open_override, default_prep_minutes, delivery_prep_buffer";

export async function fetchRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from("restaurants" as any)
    .select(RESTAURANT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) return null;
  return data as unknown as Restaurant | null;
}

/**
 * Carrega o restaurante "atual" do sistema sem depender de slug fixo.
 * Estratégia: pega o mais antigo (created_at asc). Em projetos single-tenant
 * (caso atual), isso garante o único restaurante existente.
 */
export async function fetchCurrentRestaurant(): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from("restaurants" as any)
    .select(RESTAURANT_COLUMNS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data as unknown as Restaurant | null;
}

export async function fetchBusinessHours(restaurantId: string): Promise<BusinessHour[]> {
  const { data, error } = await supabase
    .from("business_hours" as any)
    .select("weekday, opens_at, closes_at, is_closed")
    .eq("restaurant_id", restaurantId)
    .order("weekday");
  if (error) return [];
  return (data ?? []) as unknown as BusinessHour[];
}

export async function fetchMenuCategories(restaurantId: string): Promise<MenuCategory[]> {
  const { data, error } = await supabase
    .from("menu_categories" as any)
    .select("id, slug, name, display_order, active")
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .order("display_order");
  if (error) return [];
  return (data ?? []) as unknown as MenuCategory[];
}

export async function fetchPublicProducts(): Promise<PublicProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, category, description, image_url, is_featured, is_available_online, is_sold_out, display_order, active")
    .eq("active", true)
    .eq("is_available_online", true)
    .order("display_order")
    .order("name");
  if (error) return [];
  return (data ?? []) as unknown as PublicProduct[];
}

/**
 * Retorna IDs de produtos mais vendidos nos últimos `days` dias
 * (somando quantity_sold de daily_product_stats).
 * Read-only — não interfere em pedidos/impressão.
 */
export async function fetchTopSellerProductIds(days = 7): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_product_stats")
    .select("product_id, quantity_sold")
    .gte("date", sinceISO)
    .not("product_id", "is", null);
  if (error || !data) return [];

  const totals = new Map<string, number>();
  for (const row of data as Array<{ product_id: string | null; quantity_sold: number }>) {
    if (!row.product_id) continue;
    totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + Number(row.quantity_sold ?? 0));
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

export async function isRestaurantOpen(restaurantId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_restaurant_open" as any, {
    p_restaurant_id: restaurantId,
  });
  if (error) return false;
  return Boolean(data);
}

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function formatHour(t: string | null): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? "";
}

// ============================================================
// Public Menu Settings (somente apresentação visual)
// ============================================================
export type SectionKey = "hero" | "featured" | "categories" | "welcome";

export type PublicMenuSettings = {
  restaurant_id: string;
  layout_mode: "list" | "grid";
  accent_color: string;
  banner_url: string | null;
  welcome_message: string | null;
  show_descriptions: boolean;
  show_product_images: boolean;
  featured_style: "carousel" | "grid" | "hidden";
  category_order: string[];
  hidden_category_slugs: string[];
  image_aspect: "square" | "wide" | "tall";
  // Hero / Header
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_alignment: "left" | "center";
  show_logo: boolean;
  show_open_status_badge: boolean;
  show_whatsapp_fab: boolean;
  show_search_bar: boolean;
  // Seções / Home
  show_featured_section: boolean;
  show_category_nav: boolean;
  show_categories_section_title: boolean;
  categories_section_title: string;
  show_hero_banner_overlay: boolean;
  show_welcome_message_card: boolean;
  section_order: SectionKey[];
  // Paleta / UI
  background_color: string | null;
  surface_color: string | null;
  text_color: string | null;
  muted_text_color: string | null;
  button_style: "solid" | "outline" | "soft";
  card_style: "flat" | "elevated";
  radius_scale: "md" | "lg" | "xl";
  // Overrides por categoria (chave = slug da categoria)
  category_overrides: Record<string, CategoryOverride>;
};

export type CategoryLayout = "list" | "grid-2" | "grid-3";
export type CategoryCardStyle = "compact" | "detailed";
export type CategoryOverride = {
  layout?: CategoryLayout;
  image_aspect?: "square" | "wide" | "tall";
  card_style?: CategoryCardStyle;
};

export const DEFAULT_PUBLIC_MENU_SETTINGS: Omit<PublicMenuSettings, "restaurant_id"> = {
  layout_mode: "list",
  accent_color: "#E25822",
  banner_url: null,
  welcome_message: null,
  show_descriptions: true,
  show_product_images: true,
  featured_style: "carousel",
  category_order: [],
  hidden_category_slugs: [],
  image_aspect: "square",
  hero_title: null,
  hero_subtitle: null,
  hero_alignment: "center",
  show_logo: true,
  show_open_status_badge: true,
  show_whatsapp_fab: true,
  show_search_bar: true,
  show_featured_section: true,
  show_category_nav: true,
  show_categories_section_title: true,
  categories_section_title: "Categorias",
  show_hero_banner_overlay: true,
  show_welcome_message_card: true,
  section_order: ["hero", "featured", "categories", "welcome"],
  background_color: null,
  surface_color: null,
  text_color: null,
  muted_text_color: null,
  button_style: "solid",
  card_style: "elevated",
  radius_scale: "lg",
  category_overrides: {},
};

const ALL_SETTINGS_COLUMNS =
  "restaurant_id, layout_mode, accent_color, banner_url, welcome_message, show_descriptions, show_product_images, featured_style, category_order, hidden_category_slugs, image_aspect, hero_title, hero_subtitle, hero_alignment, show_logo, show_open_status_badge, show_whatsapp_fab, show_search_bar, show_featured_section, show_category_nav, show_categories_section_title, categories_section_title, show_hero_banner_overlay, show_welcome_message_card, section_order, background_color, surface_color, text_color, muted_text_color, button_style, card_style, radius_scale, category_overrides";

export async function fetchPublicMenuSettings(
  restaurantId: string,
): Promise<PublicMenuSettings> {
  const { data, error } = await supabase
    .from("public_menu_settings" as any)
    .select(ALL_SETTINGS_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !data) {
    return { restaurant_id: restaurantId, ...DEFAULT_PUBLIC_MENU_SETTINGS };
  }
  // Merge com defaults para resiliência caso colunas novas venham null
  const merged = { ...DEFAULT_PUBLIC_MENU_SETTINGS, restaurant_id: restaurantId, ...(data as any) };
  if (!merged.category_overrides || typeof merged.category_overrides !== "object") {
    merged.category_overrides = {};
  }
  return merged;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export function isValidHex(v: string): boolean {
  return HEX_RE.test(v);
}

const SLUG_RE = /^[a-z0-9-]+$/;
export function isValidSlug(v: string): boolean {
  return SLUG_RE.test(v) && v.length >= 2 && v.length <= 60;
}

/** Converte #RRGGBB ou #RGB para "h s% l%" usado nas CSS variables. */
export function hexToHslString(hex: string): string | null {
  if (!isValidHex(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let H = 0,
    S = 0;
  const L = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    S = L > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        H = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        H = (b - r) / d + 2;
        break;
      case b:
        H = (r - g) / d + 4;
        break;
    }
    H /= 6;
  }
  return `${Math.round(H * 360)} ${Math.round(S * 100)}% ${Math.round(L * 100)}%`;
}

