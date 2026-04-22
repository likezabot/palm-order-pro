import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/types";
import type { InventoryItem } from "@/lib/inventory";
import { formatQty, getStockStatus } from "@/lib/inventory";
import { resolveGroupInventory, type ProductGroup } from "@/lib/product-groups";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  group: ProductGroup;
  items: InventoryItem[];
  onCreateForProduct: (product: Product) => void;
}

export const ProductGroupBanner = ({ group, items, onCreateForProduct }: Props) => {
  const { data: products = [] } = useQuery({
    queryKey: ["group-products", group.category],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("category", group.category);
      if (error) throw error;
      return data as Product[];
    },
  });

  const variants = resolveGroupInventory(group, items, products);
  const anyExists = variants.some((g) => g.product);
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
    <TooltipProvider delayDuration={200}>
      <aside className="border-l-4 border-primary bg-primary/5 rounded-lg p-3 mx-2 mt-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">{group.icon}</span>
          <h3 className="text-sm font-black text-foreground">
            Grupo {group.name} (popup do garçom)
          </h3>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
          Itens que controlam o popup de "{group.trigger_product_name}" no PALM. Toque para localizar.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {variants.map(({ name, product, inventory }) => {
            if (!product) {
              return (
                <Tooltip key={name}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-card/50 px-2 py-1 text-[11px] text-muted-foreground cursor-help">
                      {name} · sem produto
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    <p className="text-[11px] font-semibold">Produto não cadastrado</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Crie no Admin → Cardápio antes de criar o item de estoque.
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            }
            if (!inventory) {
              return (
                <Tooltip key={name}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onCreateForProduct(product)}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-warning/50 bg-warning/5 px-2 py-1 text-[11px] font-semibold text-warning hover:bg-warning/10 transition-colors"
                    >
                      {name} · sem estoque · + criar
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px]">
                    <p className="text-[11px] font-bold">{product.name}</p>
                    <p className="text-[11px] mt-1 text-warning">
                      ⚠️ Sem item de estoque vinculado. Toque para criar.
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            }
            const status = getStockStatus(inventory);
            const statusLabel =
              status === "negative" ? "NEG"
              : status === "zero" ? "ZERADO"
              : status === "low" ? "BAIXO"
              : null;
            const statusReason =
              status === "negative" ? "Estoque negativo."
              : status === "zero" ? "Estoque zerado — vai aparecer ESGOTADO no PALM."
              : status === "low" ? `Abaixo do mínimo (${formatQty(inventory.min_stock, inventory.unit)}).`
              : "Estoque ok.";
            return (
              <Tooltip key={name}>
                <TooltipTrigger asChild>
                  <button
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
                    {name} · {formatQty(inventory.current_stock, inventory.unit)}
                    {statusLabel && <span className="ml-0.5 font-black">· {statusLabel}</span>}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px]">
                  <p className="text-[11px] font-bold">{product.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Estoque: {formatQty(inventory.current_stock, inventory.unit)} · mín{" "}
                    {formatQty(inventory.min_stock, inventory.unit)}
                  </p>
                  <p className="text-[11px] mt-1">{statusReason}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </aside>
    </TooltipProvider>
  );
};
