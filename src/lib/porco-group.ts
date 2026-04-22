/**
 * Backward-compatibility shim. The new generic system lives in `product-groups.ts`.
 * These exports are kept so older callers (ItemFormDialog) continue to work,
 * delegating to the "porco" group seeded in settings.product_groups.
 */
import { useQuery } from "@tanstack/react-query";
import {
  PRODUCT_GROUPS_KEY,
  addProductToGroup,
  useProductGroups,
  resolveGroupMembers,
  resolveGroupInventory,
  norm,
} from "@/lib/product-groups";
import type { Product } from "@/lib/types";
import type { InventoryItem } from "@/lib/inventory";

export const PORCO_GROUP_NAMES = ["Porco", "Panceta suína", "Costela suína"] as const;
export const PORCO_EXTRA_NAMES_KEY = PRODUCT_GROUPS_KEY;
export const PORCO_GROUP_ID = "porco";

const isCanonical = (name: string) =>
  PORCO_GROUP_NAMES.some((n) => norm(n) === norm(name));

export function isPorcoVariant(productName: string, extraNames: string[] = []): boolean {
  if (isCanonical(productName)) return true;
  return extraNames.some((n) => norm(n) === norm(productName));
}

export function getPorcoGroupProducts(
  products: Product[],
  extraNames: string[] = [],
): Array<{ name: string; product: Product | null; isExtra?: boolean }> {
  const base = PORCO_GROUP_NAMES.map((name) => {
    const target = norm(name);
    const product =
      products.find((p) => p.category === "espetos" && norm(p.name) === target) ?? null;
    return { name: name.toLowerCase(), product, isExtra: false };
  });
  const extras = extraNames
    .filter((n) => !PORCO_GROUP_NAMES.some((c) => norm(c) === norm(n)))
    .map((rawName) => {
      const target = norm(rawName);
      const product =
        products.find((p) => p.category === "espetos" && norm(p.name) === target) ?? null;
      return { name: rawName, product, isExtra: true };
    });
  return [...base, ...extras];
}

export function getPorcoGroupInventory(
  items: InventoryItem[],
  products: Product[],
  extraNames: string[] = [],
) {
  const group = getPorcoGroupProducts(products, extraNames);
  return group.map((g) => ({
    ...g,
    inventory: g.product ? items.find((i) => i.product_id === g.product!.id) ?? null : null,
  }));
}

export function getHiddenEspetoNames(extraNames: string[] = []): string[] {
  return [
    "panceta suína",
    "costela suína",
    ...extraNames.filter((n) => norm(n) !== "porco"),
  ].map((n) => n.toLowerCase());
}

/** Returns just the extra (non-canonical) names from the porco group. */
export function useExtraPorcoNames() {
  const { data: groups = [] } = useProductGroups();
  return useQuery({
    queryKey: ["porco-extra-names", groups.map((g) => g.id).join(",")],
    enabled: true,
    staleTime: 30_000,
    queryFn: () => {
      const porco = groups.find((g) => g.id === PORCO_GROUP_ID);
      if (!porco) return [];
      return porco.member_names.filter((n) => !isCanonical(n));
    },
  });
}

export async function addPorcoExtraName(name: string): Promise<void> {
  if (!name.trim() || isCanonical(name)) return;
  await addProductToGroup(PORCO_GROUP_ID, name);
}

export async function removePorcoExtraName(_name: string): Promise<void> {
  // Deprecated: use removeProductFromGroup from product-groups.ts directly.
}
