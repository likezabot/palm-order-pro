import { Flame } from "lucide-react";
import { type PublicProduct } from "@/lib/public-menu";
import ProductCard from "./ProductCard";

interface Props {
  products: PublicProduct[];
  disabled?: boolean;
  onSelect: (p: PublicProduct) => void;
  onQuickAdd?: (p: PublicProduct) => void;
}

/**
 * Carrossel horizontal "Mais pedidos da semana".
 * Lê a lista já cruzada (em PublicMenu) com daily_product_stats dos últimos 7 dias.
 */
export default function TopSellersSection({ products, disabled, onSelect, onQuickAdd }: Props) {
  if (!products.length) return null;

  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-accent-foreground">
          <Flame className="h-4 w-4 text-accent" />
        </span>
        <h2 className="text-base font-black uppercase tracking-wide">
          Mais pedidos da semana
        </h2>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide">
        <div className="flex gap-3 pb-1" style={{ scrollSnapType: "x mandatory" }}>
          {products.slice(0, 10).map((p) => (
            <div
              key={p.id}
              className="w-[170px] shrink-0 sm:w-[200px]"
              style={{ scrollSnapAlign: "start" }}
            >
              <ProductCard
                product={p}
                disabled={disabled}
                layout="grid"
                showImage
                showDescription={false}
                imageAspect="square"
                cardStyle="detailed"
                onClick={onSelect}
                onQuickAdd={onQuickAdd}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
