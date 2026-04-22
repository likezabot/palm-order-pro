import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/types";
import type { InventoryItem } from "@/lib/inventory";

/**
 * Generic product groups: a "group" turns a single trigger product card in PALM
 * into a popup with multiple variant products. Groups live in `settings.product_groups`
 * and are managed dynamically from the Admin.
 */
export interface ProductGroup {
  id: string;
  name: string;
  icon: string;
  category: string;
  /** Name of the product that appears in the PALM grid as the popup trigger. */
  trigger_product_name: string;
  /** Names of products that show up inside the popup (includes the trigger). */
  member_names: string[];
}

export const PRODUCT_GROUPS_KEY = "product_groups";

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const slugifyId = (s: string) =>
  norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `g-${Date.now()}`;

async function fetchGroups(): Promise<ProductGroup[]> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", PRODUCT_GROUPS_KEY)
    .maybeSingle();
  if (error) throw error;
  if (!data?.value) return [];
  try {
    const parsed = JSON.parse(data.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((g): g is ProductGroup =>
      g && typeof g.id === "string" && typeof g.name === "string" &&
      typeof g.category === "string" && Array.isArray(g.member_names),
    ).map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon || "📦",
      category: g.category,
      trigger_product_name: g.trigger_product_name || g.name,
      member_names: g.member_names.filter((n: unknown) => typeof n === "string"),
    }));
  } catch {
    return [];
  }
}

export function useProductGroups() {
  return useQuery({
    queryKey: ["settings", PRODUCT_GROUPS_KEY],
    staleTime: 30_000,
    queryFn: fetchGroups,
  });
}

export function useInvalidateProductGroups() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["settings", PRODUCT_GROUPS_KEY] });
}

export function getGroupsForCategory(groups: ProductGroup[], category: string): ProductGroup[] {
  return groups.filter((g) => g.category === category);
}

/** Returns names that should be hidden from the main grid in PALM (members of any group, except the trigger). */
export function getHiddenProductNames(groups: ProductGroup[], category: string): string[] {
  const hidden: string[] = [];
  for (const g of groups) {
    if (g.category !== category) continue;
    const triggerNorm = norm(g.trigger_product_name);
    for (const m of g.member_names) {
      if (norm(m) !== triggerNorm) hidden.push(m);
    }
  }
  return hidden.map((n) => n.toLowerCase());
}

export function findGroupByTrigger(productName: string, groups: ProductGroup[]): ProductGroup | null {
  const target = norm(productName);
  return groups.find((g) => norm(g.trigger_product_name) === target) ?? null;
}

export function findGroupForProduct(productName: string, groups: ProductGroup[]): ProductGroup | null {
  const target = norm(productName);
  return groups.find((g) => g.member_names.some((m) => norm(m) === target)) ?? null;
}

/** Returns members of a group resolved against the products list. */
export function resolveGroupMembers(
  group: ProductGroup,
  products: Product[],
): Array<{ name: string; product: Product | null }> {
  return group.member_names.map((name) => {
    const target = norm(name);
    const product =
      products.find((p) => p.category === group.category && norm(p.name) === target) ?? null;
    return { name, product };
  });
}

export function resolveGroupInventory(
  group: ProductGroup,
  items: InventoryItem[],
  products: Product[],
): Array<{ name: string; product: Product | null; inventory: InventoryItem | null }> {
  return resolveGroupMembers(group, products).map((m) => ({
    ...m,
    inventory: m.product ? items.find((i) => i.product_id === m.product!.id) ?? null : null,
  }));
}

async function writeGroups(next: ProductGroup[]): Promise<void> {
  const { data } = await supabase
    .from("settings")
    .select("id")
    .eq("key", PRODUCT_GROUPS_KEY)
    .maybeSingle();
  const value = JSON.stringify(next);
  if (data) {
    await supabase
      .from("settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", PRODUCT_GROUPS_KEY);
  } else {
    await supabase.from("settings").insert({ key: PRODUCT_GROUPS_KEY, value });
  }
}

/** Adds a product name to a group's members (idempotent). Creates the group if it doesn't exist. */
export async function addProductToGroup(groupId: string, productName: string): Promise<void> {
  const trimmed = productName.trim();
  if (!trimmed) return;
  const groups = await fetchGroups();
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx === -1) return;
  const target = norm(trimmed);
  if (groups[idx].member_names.some((n) => norm(n) === target)) return;
  groups[idx] = { ...groups[idx], member_names: [...groups[idx].member_names, trimmed] };
  await writeGroups(groups);
}

/** Removes a product name from a group's members. */
export async function removeProductFromGroup(groupId: string, productName: string): Promise<void> {
  const groups = await fetchGroups();
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx === -1) return;
  const target = norm(productName);
  const next = groups[idx].member_names.filter((n) => norm(n) !== target);
  groups[idx] = { ...groups[idx], member_names: next };
  await writeGroups(groups);
}

/** Creates a new group (id is derived from name if not provided). */
export async function createGroup(input: {
  name: string;
  icon?: string;
  category: string;
  trigger_product_name: string;
  member_names?: string[];
}): Promise<ProductGroup> {
  const groups = await fetchGroups();
  const baseId = slugifyId(input.name);
  let id = baseId;
  let n = 2;
  while (groups.some((g) => g.id === id)) {
    id = `${baseId}-${n++}`;
  }
  const group: ProductGroup = {
    id,
    name: input.name.trim(),
    icon: input.icon?.trim() || "📦",
    category: input.category,
    trigger_product_name: input.trigger_product_name.trim(),
    member_names: input.member_names ?? [input.trigger_product_name.trim()],
  };
  await writeGroups([...groups, group]);
  return group;
}

/** Updates fields of an existing group. */
export async function updateGroup(
  groupId: string,
  patch: Partial<Omit<ProductGroup, "id">>,
): Promise<void> {
  const groups = await fetchGroups();
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx === -1) return;
  groups[idx] = { ...groups[idx], ...patch };
  await writeGroups(groups);
}

/** Deletes a group (does NOT delete underlying products). */
export async function deleteGroup(groupId: string): Promise<void> {
  const groups = await fetchGroups();
  await writeGroups(groups.filter((g) => g.id !== groupId));
}
