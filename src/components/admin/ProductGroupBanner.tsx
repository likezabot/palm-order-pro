import { Eye, EyeOff } from "lucide-react";
import type { Product } from "@/lib/types";
import { resolveGroupMembers, type ProductGroup } from "@/lib/product-groups";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  group: ProductGroup;
  products: Product[];
}

export const ProductGroupBanner = ({ group, products }: Props) => {
  const variants = resolveGroupMembers(group, products);
  const anyExists = variants.some((v) => v.product);
  if (!anyExists) return null;

  const focusCard = (productId: string) => {
    const el = document.querySelector(
      `[data-product-id="${productId}"]`
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
      <aside className="border-l-4 border-primary bg-primary/5 rounded-lg p-3 mb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">{group.icon}</span>
          <h3 className="text-sm font-black text-foreground">
            Grupo {group.name} (popup do garçom)
          </h3>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
          Estes itens aparecem juntos no popup ao tocar em "{group.trigger_product_name}" no
          PALM. Edite preço e visibilidade individualmente abaixo.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {variants.map(({ name, product }) => {
            if (!product) {
              return (
                <Tooltip key={name}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-card/50 px-2 py-1 text-[11px] text-muted-foreground cursor-help">
                      {name} · não cadastrado
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    <p className="text-[11px] font-semibold">Produto não encontrado</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Nenhum produto chamado "{name}" nesta categoria. Crie em "+ Novo".
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            }
            return (
              <Tooltip key={name}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => focusCard(product.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors hover:bg-card",
                      product.active
                        ? "border-primary/40 bg-card text-foreground"
                        : "border-destructive/40 bg-destructive/5 text-destructive"
                    )}
                  >
                    {product.active ? <Eye size={11} /> : <EyeOff size={11} />}
                    {name} · {product.active ? "ativo" : "oculto"}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px]">
                  <p className="text-[11px] font-bold">{product.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    R$ {product.price.toFixed(2)}
                  </p>
                  <p className="text-[11px] mt-1">
                    {product.active ? (
                      <span className="text-foreground">
                        ✅ Visível no PALM — aparece no popup.
                      </span>
                    ) : (
                      <span className="text-destructive">
                        🚫 Oculto — não aparece no popup.
                      </span>
                    )}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </aside>
    </TooltipProvider>
  );
};
