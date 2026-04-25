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

export async function fetchRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from("restaurants" as any)
    .select("id, slug, name, logo_url, hero_url, description, whatsapp_phone, is_open_override, default_prep_minutes, delivery_prep_buffer")
    .eq("slug", slug)
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
};

export async function fetchPublicMenuSettings(
  restaurantId: string,
): Promise<PublicMenuSettings> {
  const { data, error } = await supabase
    .from("public_menu_settings" as any)
    .select(
      "restaurant_id, layout_mode, accent_color, banner_url, welcome_message, show_descriptions, show_product_images, featured_style, category_order, hidden_category_slugs, image_aspect",
    )
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !data) {
    return { restaurant_id: restaurantId, ...DEFAULT_PUBLIC_MENU_SETTINGS };
  }
  return data as unknown as PublicMenuSettings;
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

