import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/types";
import type { InventoryItem } from "@/lib/inventory";
import { formatQty, getStockStatus } from "@/lib/inventory";
import { getPorcoGroupInventory } from "@/lib/porco-group";
import { cn } from "@/lib/utils";

interface Props {
  items: InventoryItem[];
  onCreateForProduct: (product: Product) => void;
}

const DISPLAY_NAMES: Record<string, string> = {
  porco: "Porco",
  "panceta suína": "Panceta suína",
  "costela suína": "Costela suína",
};

export const PorcoGroupBanner = ({ items, onCreateForProduct }: Props) => {
  const { data: products = [] } = useQuery({
    queryKey: ["porco-group-products"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("category", "espetos");
      if (error) throw error;
      return data as Product[];
    },
  });

  const group = getPorcoGroupInventory(items, products);
  const anyExists = group.some((g) => g.product);
  if (!anyExists) return null;

  const focusCard = (inventoryId: string) => {
    const el = document.querySelector(
      `[data-stock-item-id="${inventoryId}"]`
    ) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background");
    setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background");
    }, 1500);
  };

  return (
    <aside className="border-l-4 border-primary bg-primary/5 rounded-lg p-3 mx-2 mt-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🐷</span>
        <h3 className="text-sm font-black text-foreground">Grupo Porco (popup do garçom)</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
        3 itens controlam o popup de variantes no PALM. Toque para localizar o card abaixo.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {group.map(({ name, product, inventory }) => {
          const label = DISPLAY_NAMES[name] ?? name;
          if (!product) {
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-card/50 px-2 py-1 text-[11px] text-muted-foreground"
              >
                {label} · sem produto
              </span>
            );
          }
          if (!inventory) {
            return (
              <button
                key={name}
                onClick={() => onCreateForProduct(product)}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-warning/50 bg-warning/5 px-2 py-1 text-[11px] font-semibold text-warning hover:bg-warning/10 transition-colors"
              >
                {label} · sem estoque · + criar
              </button>
            );
          }
          const status = getStockStatus(inventory);
          const statusLabel =
            status === "negative"
              ? "NEG"
              : status === "zero"
              ? "ZERADO"
              : status === "low"
              ? "BAIXO"
              : null;
          return (
            <button
              key={name}
              onClick={() => focusCard(inventory.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors hover:bg-card",
                status === "negative" || status === "zero"
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : status === "low"
                  ? "border-warning/40 bg-warning/5 text-warning"
                  : "border-primary/40 bg-card text-foreground"
              )}
            >
              {label} · {formatQty(inventory.current_stock, inventory.unit)}
              {statusLabel && (
                <span className="ml-0.5 font-black">· {statusLabel}</span>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
};
