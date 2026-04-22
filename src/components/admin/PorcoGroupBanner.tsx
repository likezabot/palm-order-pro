import { Eye, EyeOff } from "lucide-react";
import type { Product } from "@/lib/types";
import { getPorcoGroupProducts } from "@/lib/porco-group";
import { cn } from "@/lib/utils";

interface Props {
  products: Product[];
}

const DISPLAY_NAMES: Record<string, string> = {
  porco: "Porco",
  "panceta suína": "Panceta suína",
  "costela suína": "Costela suína",
};

export const PorcoGroupBanner = ({ products }: Props) => {
  const variants = getPorcoGroupProducts(products);
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
    <aside className="border-l-4 border-primary bg-primary/5 rounded-lg p-3 mb-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🐷</span>
        <h3 className="text-sm font-black text-foreground">Grupo Porco (popup do garçom)</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
        Estes 3 itens aparecem juntos no popup ao tocar em "Porco" no PALM. Edite preço e
        visibilidade individualmente abaixo — eles continuam controláveis aqui.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {variants.map(({ name, product }) => {
          const label = DISPLAY_NAMES[name] ?? name;
          if (!product) {
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-card/50 px-2 py-1 text-[11px] text-muted-foreground"
              >
                {label} · não cadastrado
              </span>
            );
          }
          return (
            <button
              key={name}
              onClick={() => focusCard(product.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors hover:bg-card",
                product.active
                  ? "border-primary/40 bg-card text-foreground"
                  : "border-destructive/40 bg-destructive/5 text-destructive"
              )}
            >
              {product.active ? <Eye size={11} /> : <EyeOff size={11} />}
              {label} · {product.active ? "ativo" : "oculto"}
            </button>
          );
        })}
      </div>
    </aside>
  );
};
