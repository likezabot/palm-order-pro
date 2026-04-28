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
          ? "border-b border-white/10 bg-black/60 backdrop-blur-xl shadow-lg translate-y-0"
          : "bg-transparent translate-y-0",
      )}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
      <div className="flex flex-nowrap overflow-x-auto gap-2.5 py-4 no-scrollbar scroll-smooth">
        {categories.map((c) => {
          const isActive = activeSlug === c.slug;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.slug)}
              className={cn(
                "shrink-0 rounded-full px-5 py-2.5 text-[13px] font-bold transition-all duration-200 uppercase tracking-tight",
                "min-h-[40px] flex items-center justify-center whitespace-nowrap",
                isActive
                  ? "text-white border-white/20 shadow-[0_4px_12px_rgba(255,106,0,0.3)] scale-[1.02]"
                  : "bg-white/10 text-white border border-white/20 hover:bg-white/15 active:bg-white/20",
              )}
              style={isActive ? { background: "var(--brand-gradient)" } : { background: "rgba(255, 255, 255, 0.08)", borderColor: "rgba(255, 255, 255, 0.18)" }}
            >
              {c.name}
            </button>
          );
        })}
        {/* Spacer for horizontal scroll padding at the end */}
        <div className="shrink-0 w-4 h-1" aria-hidden="true" />
      </div>
    </div>
  );
}
