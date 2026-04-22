import type { Product } from "@/lib/types";
import type { InventoryItem } from "@/lib/inventory";

/**
 * Names of the 3 "Porco" variants that share the popup in PALM.
 * Match is case/diacritic-insensitive via normalize().
 */
export const PORCO_GROUP_NAMES = ["porco", "panceta suína", "costela suína"] as const;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const PORCO_GROUP_NORMALIZED = PORCO_GROUP_NAMES.map(norm);

export function isPorcoVariant(productName: string): boolean {
  return PORCO_GROUP_NORMALIZED.includes(norm(productName));
}

/** Returns the 3 products in canonical order (Porco, Panceta, Costela). null when missing. */
export function getPorcoGroupProducts(products: Product[]): Array<{
  name: (typeof PORCO_GROUP_NAMES)[number];
  product: Product | null;
}> {
  return PORCO_GROUP_NAMES.map((name) => {
    const target = norm(name);
    const product =
      products.find((p) => p.category === "espetos" && norm(p.name) === target) ?? null;
    return { name, product };
  });
}

/** Returns the inventory items linked to any Porco-group product. */
export function getPorcoGroupInventory(
  items: InventoryItem[],
  products: Product[],
): Array<{
  name: (typeof PORCO_GROUP_NAMES)[number];
  product: Product | null;
  inventory: InventoryItem | null;
}> {
  const group = getPorcoGroupProducts(products);
  return group.map((g) => {
    const inventory = g.product
      ? items.find((i) => i.product_id === g.product!.id) ?? null
      : null;
    return { ...g, inventory };
  });
}
