import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a map of product_id → current_stock for every inventory_item
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
        .select("product_id, current_stock")
        .not("product_id", "is", null);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ product_id: string; current_stock: number }>) {
        if (row.product_id) map.set(row.product_id, Number(row.current_stock));
      }
      return map;
    },
  });
}

export function isProductEsgotado(
  stockMap: Map<string, number> | undefined,
  productId: string,
): boolean {
  if (!stockMap) return false;
  const stock = stockMap.get(productId);
  if (stock === undefined) return false; // not linked → not tracked → not esgotado
  return stock <= 0;
}
