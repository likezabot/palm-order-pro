import { type PublicProduct } from "@/lib/public-menu";
import { Star } from "lucide-react";

type Props = {
  products: PublicProduct[];
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FeaturedCarousel({ products }: Props) {
  if (!products.length) return null;
  return (
    <section className="mt-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        <Star className="h-4 w-4 fill-primary text-primary" />
        Destaques
      </h2>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-thin">
        {products.map((p) => (
          <article
            key={p.id}
            className="w-44 shrink-0 overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="h-28 w-full bg-muted">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl">🔥</div>
              )}
            </div>
            <div className="p-2">
              <p className="truncate text-sm font-bold">{p.name}</p>
              <p className="text-sm font-black text-primary">{formatBRL(p.price)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
