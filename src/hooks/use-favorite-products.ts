import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Calcula os IDs dos produtos mais vendidos nos últimos N dias.
 * Soma quantidades em order_items de pedidos pagos no período.
 */
export function useFavoriteProductIds(limit = 12, daysBack = 30) {
  return useQuery({
    queryKey: ["favorite-products", limit, daysBack],
    queryFn: async (): Promise<string[]> => {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      const { data: orders } = await supabase
        .from("orders")
        .select("id")
        .gte("created_at", since.toISOString())
        .in("status", ["paid", "done"]);

      const ids = (orders ?? []).map((o) => o.id);
      if (ids.length === 0) return [];

      const { data: items } = await supabase
        .from("order_items")
        .select("product_id, quantity")
        .in("order_id", ids)
        .not("product_id", "is", null);

      const totals = new Map<string, number>();
      (items ?? []).forEach((it) => {
        if (!it.product_id) return;
        totals.set(it.product_id, (totals.get(it.product_id) ?? 0) + (it.quantity ?? 0));
      });

      return Array.from(totals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);
    },
    staleTime: 5 * 60 * 1000,
  });
}
