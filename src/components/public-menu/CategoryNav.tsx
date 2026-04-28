import { useEffect, useRef, useState } from "react";
import { type MenuCategory } from "@/lib/public-menu";
import { cn } from "@/lib/utils";

type Props = {
  categories: MenuCategory[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
};

/**
 * Navegação de categorias responsiva (premium):
 * - Chip ativo com gradiente de marca + glow.
 * - Chip inativo limpo, com hairline e fundo card.
 * - Sticky com blur elegante e borda em tom de marca a 10%.
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
        "sticky top-0 z-20 -mx-4 px-4 transition-all duration-300",
        stuck
          ? "border-b border-primary/20 bg-background/95 backdrop-blur-xl shadow-[0_8px_32px_-12px_hsl(var(--primary)/0.35)] translate-y-0"
          : "bg-transparent translate-y-1",
      )}
    >
      <div className="flex flex-nowrap overflow-x-auto gap-2 py-3 no-scrollbar scroll-smooth">
        {categories.map((c) => {
          const isActive = activeSlug === c.slug;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.slug)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                "min-h-[32px]",
                isActive
                  ? "text-primary-foreground shadow-[0_6px_18px_-4px_hsl(var(--primary)/0.55)] scale-[1.02]"
                  : "border border-border/70 bg-card/80 text-foreground/75 hover:bg-card hover:text-foreground hover:border-primary/30",
              )}
              style={isActive ? { background: "var(--brand-gradient)" } : undefined}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
