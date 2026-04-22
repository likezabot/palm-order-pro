import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a map of product_id → current_stock for every active inventory_item
 * linked to a menu product. Used by the PALM menu to show ESGOTADO badges
 * (current_stock <= 0) without hiding the item — visibility is controlled
 * by the Admin (`products.active`).
 */
export function useProductStockMap() {
  return useQuery({
    queryKey: ["product-stock-map"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items" as any)
        .select("product_id, current_stock, is_active")
        .not("product_id", "is", null)
        .eq("is_active", true);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of ((data ?? []) as unknown) as Array<{ product_id: string; current_stock: number }>) {
        if (row.product_id) map.set(row.product_id, Number(row.current_stock));
      }
      return map;
    },
  });
}

export type ProductRecipe = {
  product_id: string;
  ingredient_product_id: string;
};

/**
 * Returns all product → ingredient recipes. Used to mark a derivative dish
 * (e.g. "Janta de costela bovina") as esgotado when ANY of its ingredient
 * products (e.g. "Costela de boi (borboleta)") is out of stock.
 */
export function useProductRecipes() {
  return useQuery({
    queryKey: ["product-recipes"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_recipes" as any)
        .select("product_id, ingredient_product_id");
      if (error) throw error;
      const byProduct = new Map<string, string[]>();
      for (const row of ((data ?? []) as unknown) as ProductRecipe[]) {
        const list = byProduct.get(row.product_id) ?? [];
        list.push(row.ingredient_product_id);
        byProduct.set(row.product_id, list);
      }
      return byProduct;
    },
  });
}

export function isProductEsgotado(
  stockMap: Map<string, number> | undefined,
  productId: string,
  recipes?: Map<string, string[]> | undefined,
): boolean {
  if (!stockMap) return false;
  // 1) direct stock link
  const stock = stockMap.get(productId);
  if (stock !== undefined && stock <= 0) return true;
  // 2) recipe-based: esgotado if ANY ingredient is out of stock
  const ingredients = recipes?.get(productId);
  if (ingredients && ingredients.length > 0) {
    for (const ingId of ingredients) {
      const ingStock = stockMap.get(ingId);
      if (ingStock !== undefined && ingStock <= 0) return true;
    }
  }
  return false;
}
