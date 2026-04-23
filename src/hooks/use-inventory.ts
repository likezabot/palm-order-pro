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
      const { withPin } = await import("@/lib/manager-pin");
      const result = await withPin(async (pin) => {
        const { data, error } = await supabase.rpc("admin_upsert_inventory_item" as any, {
          p_pin: pin,
          p_id: item.id ?? null,
          p_name: item.name,
          p_slug: item.slug,
          p_category: item.category,
          p_unit: item.unit,
          p_aliases: item.aliases ?? [],
          p_min_stock: item.min_stock ?? 0,
          p_is_active: item.is_active ?? true,
          p_product_id: item.product_id ?? null,
          p_current_stock: item.current_stock ?? 0,
        });
        if (error) throw error;
        return data;
      }, item.id ? "Editar item de estoque" : "Criar item de estoque");
      if (result === null) throw new Error("Operação cancelada");
      return result;
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
      // Reusa o upsert (que valida PIN) — busca item atual e atualiza is_active=false.
      const { data: cur, error: e1 } = await supabase
        .from("inventory_items" as any)
        .select("*")
        .eq("id", id)
        .single();
      if (e1) throw e1;
      const c = cur as any;
      const { withPin } = await import("@/lib/manager-pin");
      await withPin(async (pin) => {
        const { error } = await supabase.rpc("admin_upsert_inventory_item" as any, {
          p_pin: pin,
          p_id: id,
          p_name: c.name,
          p_slug: c.slug,
          p_category: c.category,
          p_unit: c.unit,
          p_aliases: c.aliases ?? [],
          p_min_stock: c.min_stock ?? 0,
          p_is_active: false,
          p_product_id: c.product_id ?? null,
          p_current_stock: c.current_stock ?? 0,
        });
        if (error) throw error;
      }, "Desativar item de estoque");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory-items"] }),
  });
}

/**
 * Toggles `active` on a menu product. Sem PIN: garçom pode marcar esgotado
 * em rotina operacional. RPC `toggle_product_active` é SECURITY DEFINER.
 */
export function useToggleProductActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { product_id: string; active: boolean }) => {
      const { error } = await supabase.rpc("toggle_product_active" as any, {
        p_id: vars.product_id,
        p_active: vars.active,
      });
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
      const { withPin } = await import("@/lib/manager-pin");
      const result = await withPin(async (pin) => {
        const { data, error } = await supabase.rpc("admin_bulk_import_inventory" as any, {
          p_pin: pin,
          p_items: rows,
        });
        if (error) throw error;
        return data as number;
      }, "Importar produtos do cardápio");
      return { inserted: result ?? 0 };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      qc.invalidateQueries({ queryKey: ["menu-products-for-stock"] });
    },
  });
}
