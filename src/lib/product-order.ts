import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/lib/types";

const KEY_PREFIX = "product_order_";

export const orderKey = (category: string) => `${KEY_PREFIX}${category}`;

/** Ordena um array de produtos pela ordem persistida (IDs), com fallback alfabético. */
export const sortByPersistedOrder = (products: Product[], orderIds: string[] | null) => {
  if (!orderIds || orderIds.length === 0) return [...products];
  const idx = new Map(orderIds.map((id, i) => [id, i]));
  return [...products].sort((a, b) => {
    const ai = idx.has(a.id) ? (idx.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
    const bi = idx.has(b.id) ? (idx.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
};

/** Lê a ordem persistida de uma categoria. Retorna null se não houver. */
export const fetchOrder = async (category: string): Promise<string[] | null> => {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", orderKey(category))
    .maybeSingle();
  if (!data) return null;
  try {
    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Lê a ordem persistida de TODAS as categorias passadas. */
export const fetchAllOrders = async (categories: string[]) => {
  const keys = categories.map(orderKey);
  const { data } = await supabase
    .from("settings")
    .select("key,value")
    .in("key", keys);
  const map: Record<string, string[]> = {};
  (data ?? []).forEach((row) => {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) {
        const cat = row.key.replace(KEY_PREFIX, "");
        map[cat] = parsed;
      }
    } catch {
      /* ignore */
    }
  });
  return map;
};

/** Persiste a ordem de IDs de uma categoria (upsert). */
export const saveOrder = async (category: string, ids: string[]) => {
  const key = orderKey(category);
  const value = JSON.stringify(ids);
  const { data: existing } = await supabase
    .from("settings")
    .select("id")
    .eq("key", key)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("settings")
      .update({ value })
      .eq("key", key);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("settings").insert({ key, value });
    if (error) throw error;
  }
};
