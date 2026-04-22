import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { InventoryItem, InventoryMovement } from "@/lib/inventory";

export function useInventoryItems() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("inventory_items_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_items" },
        () => {
          qc.invalidateQueries({ queryKey: ["inventory-items"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return useQuery({
    queryKey: ["inventory-items"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items" as any)
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as InventoryItem[];
    },
  });
}

export function useInventoryMovements(itemId: string | null) {
  return useQuery({
    queryKey: ["inventory-movements", itemId],
    enabled: !!itemId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements" as any)
        .select("*")
        .eq("item_id", itemId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as InventoryMovement[];
    },
  });
}

export type ApplyMovementResult = {
  new_stock: number;
  previous_stock: number;
  item_name: string | null;
  linked_product_id: string | null;
  linked_product_active: boolean | null;
};

export function useApplyMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      item_id: string;
      type: "in" | "out" | "adjustment";
      quantity: number;
      note?: string;
      source?: "manual" | "telegram" | "pdv" | "system";
    }) => {
      const { data, error } = await supabase.rpc("apply_inventory_movement" as any, {
        p_item_id: vars.item_id,
        p_type: vars.type,
        p_quantity: vars.quantity,
        p_note: vars.note ?? null,
        p_source: vars.source ?? "manual",
      });
      if (error) throw error;
      return data as unknown as ApplyMovementResult;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements", vars.item_id] });
    },
  });
}

export function useUpsertInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      item: Partial<InventoryItem> & { name: string; slug: string; category: string; unit: string }
    ) => {
      const payload: any = {
        name: item.name,
        slug: item.slug,
        category: item.category,
        unit: item.unit,
        aliases: item.aliases ?? [],
        min_stock: item.min_stock ?? 0,
        is_active: item.is_active ?? true,
        product_id: item.product_id ?? null,
      };
      if (item.id) {
        const { data, error } = await supabase
          .from("inventory_items" as any)
          .update(payload)
          .eq("id", item.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        payload.current_stock = item.current_stock ?? 0;
        const { data, error } = await supabase
          .from("inventory_items" as any)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      qc.invalidateQueries({ queryKey: ["menu-products-for-stock"] });
    },
  });
}

export function useDeactivateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("inventory_items" as any)
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory-items"] }),
  });
}

/**
 * Toggles `active` on a menu product. Used by the out-of-stock confirm dialog
 * (set active=false) and by the "Reactivate in menu" button (set active=true).
 */
export function useToggleProductActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { product_id: string; active: boolean }) => {
      const { error } = await supabase
        .from("products")
        .update({ active: vars.active })
        .eq("id", vars.product_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["menu-products-for-stock"] });
    },
  });
}

export function useBulkImportFromMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      products: Array<{ id: string; name: string; category: string }>
    ) => {
      const { slugify, mapMenuCategoryToStock } = await import("@/lib/inventory");
      const rows = products.map((p) => ({
        name: p.name,
        slug: slugify(p.name) || p.id,
        category: mapMenuCategoryToStock(p.category),
        unit: "unidade",
        aliases: [] as string[],
        current_stock: 0,
        min_stock: 0,
        is_active: true,
        product_id: p.id,
      }));
      if (rows.length === 0) return { inserted: 0 };
      const { error } = await supabase.from("inventory_items" as any).insert(rows);
      if (error) throw error;
      return { inserted: rows.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      qc.invalidateQueries({ queryKey: ["menu-products-for-stock"] });
    },
  });
}
