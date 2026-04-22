import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/types";
import type { InventoryItem } from "@/lib/inventory";

/**
 * Canonical "Porco" group variants that share the popup in PALM.
 * Match is case/diacritic-insensitive via normalize().
 */
export const PORCO_GROUP_NAMES = ["porco", "panceta suína", "costela suína"] as const;

/** Settings key holding extra names added by the user via the product form. */
export const PORCO_EXTRA_NAMES_KEY = "porco_group_extra_names";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const PORCO_GROUP_NORMALIZED = PORCO_GROUP_NAMES.map(norm);

export function isPorcoVariant(productName: string, extraNames: string[] = []): boolean {
  const all = [...PORCO_GROUP_NORMALIZED, ...extraNames.map(norm)];
  return all.includes(norm(productName));
}

/** Returns the canonical group products + any extra ones added via settings. */
export function getPorcoGroupProducts(
  products: Product[],
  extraNames: string[] = [],
): Array<{
  name: string;
  product: Product | null;
  isExtra?: boolean;
}> {
  const base = PORCO_GROUP_NAMES.map((name) => {
    const target = norm(name);
    const product =
      products.find((p) => p.category === "espetos" && norm(p.name) === target) ?? null;
    return { name, product, isExtra: false };
  });

  const extras = extraNames
    .map((rawName) => {
      const target = norm(rawName);
      // Skip if already covered by base group.
      if (PORCO_GROUP_NORMALIZED.includes(target)) return null;
      const product =
        products.find((p) => p.category === "espetos" && norm(p.name) === target) ?? null;
      return { name: rawName, product, isExtra: true };
    })
    .filter((v): v is { name: string; product: Product | null; isExtra: boolean } => !!v);

  return [...base, ...extras];
}

/** Returns the inventory items linked to any Porco-group product. */
export function getPorcoGroupInventory(
  items: InventoryItem[],
  products: Product[],
  extraNames: string[] = [],
): Array<{
  name: string;
  product: Product | null;
  inventory: InventoryItem | null;
  isExtra?: boolean;
}> {
  const group = getPorcoGroupProducts(products, extraNames);
  return group.map((g) => {
    const inventory = g.product
      ? items.find((i) => i.product_id === g.product!.id) ?? null
      : null;
    return { ...g, inventory };
  });
}

/** Returns the names that should be hidden from the main Espetos grid (canonical extras + dynamic). */
export function getHiddenEspetoNames(extraNames: string[] = []): string[] {
  // "porco" itself stays visible — it's the popup trigger card.
  return [
    "panceta suína",
    "costela suína",
    ...extraNames.filter((n) => norm(n) !== "porco"),
  ].map((n) => n.toLowerCase());
}

/** React Query hook: fetches the dynamic list of extra Porco group names from settings. */
export function useExtraPorcoNames() {
  return useQuery({
    queryKey: ["settings", PORCO_EXTRA_NAMES_KEY],
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", PORCO_EXTRA_NAMES_KEY)
        .maybeSingle();
      if (error) throw error;
      if (!data?.value) return [];
      try {
        const parsed = JSON.parse(data.value);
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
      } catch {
        return [];
      }
    },
  });
}

/** Adds a name to the porco_group_extra_names settings list (idempotent). */
export async function addPorcoExtraName(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  // Skip if canonical.
  if (PORCO_GROUP_NORMALIZED.includes(norm(trimmed))) return;

  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", PORCO_EXTRA_NAMES_KEY)
    .maybeSingle();

  let current: string[] = [];
  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value);
      if (Array.isArray(parsed)) current = parsed.filter((x) => typeof x === "string");
    } catch {
      current = [];
    }
  }

  if (current.some((n) => norm(n) === norm(trimmed))) return;
  const next = [...current, trimmed];

  if (data) {
    await supabase
      .from("settings")
      .update({ value: JSON.stringify(next), updated_at: new Date().toISOString() })
      .eq("key", PORCO_EXTRA_NAMES_KEY);
  } else {
    await supabase
      .from("settings")
      .insert({ key: PORCO_EXTRA_NAMES_KEY, value: JSON.stringify(next) });
  }
}

/** Removes a name from the extras list. */
export async function removePorcoExtraName(name: string): Promise<void> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", PORCO_EXTRA_NAMES_KEY)
    .maybeSingle();
  if (!data?.value) return;
  let current: string[] = [];
  try {
    const parsed = JSON.parse(data.value);
    if (Array.isArray(parsed)) current = parsed.filter((x) => typeof x === "string");
  } catch {
    return;
  }
  const next = current.filter((n) => norm(n) !== norm(name));
  await supabase
    .from("settings")
    .update({ value: JSON.stringify(next), updated_at: new Date().toISOString() })
    .eq("key", PORCO_EXTRA_NAMES_KEY);
}
