import { useEffect, useRef, useState } from "react";
import { type MenuCategory } from "@/lib/public-menu";
import { cn } from "@/lib/utils";

type Props = {
  categories: MenuCategory[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
};

/**
 * Navegação de categorias responsiva:
 * - Em telas pequenas: wrap em flex-wrap (sem rolagem horizontal forçada).
 * - Em telas maiores: pode usar scroll horizontal suave se houver muitas.
 * - Sticky no topo quando rola.
 */
export default function CategoryNav({ categories, activeSlug, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.getBoundingClientRect().top;
      setStuck(top <= 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!categories.length) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "sticky top-0 z-20 -mx-4 mt-3 px-4 transition-all",
        stuck ? "border-b border-border bg-background/95 backdrop-blur" : "bg-background",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap gap-1.5 py-2",
          // Em telas muito pequenas com muitas categorias, ainda permitimos
          // overflow x sutil; mas o flex-wrap já evita rolagem horizontal feia.
        )}
      >
        {categories.map((c) => {
          const isActive = activeSlug === c.slug;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.slug)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors",
                "min-h-[36px]",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
