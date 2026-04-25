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
    .select("id, slug, name, logo_url, hero_url, description, whatsapp_phone, is_open_override, default_prep_minutes")
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
