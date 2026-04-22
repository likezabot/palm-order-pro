import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MenuProduct = {
  id: string;
  name: string;
  category: string;
  active: boolean;
};

/**
 * Lists all menu products (active or not) along with the inventory item that
 * already controls them, so the UI can show what's available to link/import.
 */
export function useMenuProductsForStock() {
  return useQuery({
    queryKey: ["menu-products-for-stock"],
    staleTime: 30_000,
    queryFn: async () => {
      const [productsRes, linkedRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, category, active")
          .order("category", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("inventory_items" as any)
          .select("id, product_id")
          .not("product_id", "is", null),
      ]);
      if (productsRes.error) throw productsRes.error;
      if (linkedRes.error) throw linkedRes.error;
      const linked = new Set(((linkedRes.data ?? []) as any[]).map((r) => r.product_id as string));
      const products = (productsRes.data ?? []) as MenuProduct[];
      return products.map((p) => ({ ...p, linked: linked.has(p.id) }));
    },
  });
}
