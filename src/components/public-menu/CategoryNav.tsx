import { useEffect, useRef, useState } from "react";
import { type MenuCategory } from "@/lib/public-menu";
import { cn } from "@/lib/utils";

type Props = {
  categories: MenuCategory[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
};

/**
 * Navegação de categorias definitiva:
 * - Sem scroll horizontal (grid responsiva).
 * - Sticky compacto com blur.
 * - Sincronização inteligente com scroll.
 */
export default function CategoryNav({ categories, activeSlug, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Ativa o estado stuck quando o topo do container encosta no topo da tela
      setStuck(rect.top <= 0);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Chama imediatamente para caso já comece scrollado
    handleScroll();
    
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!categories.length) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "sticky top-0 z-40 w-full transition-all duration-300",
        stuck 
          ? "bg-[#0F0806]/92 backdrop-blur-[10px] border-b border-white/10 shadow-xl py-2 px-2" 
          : "bg-transparent py-4 px-0"
      )}
    >
      <div className="mx-auto max-w-3xl">
        <div 
          className={cn(
            "grid gap-2",
            categories.length === 4 ? "grid-cols-2 sm:grid-cols-4" :
            categories.length <= 3 ? "grid-cols-3" : 
            categories.length <= 6 ? "grid-cols-3 sm:grid-cols-6" :
            "grid-cols-3 sm:grid-cols-4 md:grid-cols-6"
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
                  "transition-all duration-200 uppercase tracking-tight",
                  "flex items-center justify-center whitespace-nowrap border",
                  "touch-manipulation select-none overflow-hidden",
                  stuck 
                    ? "h-[36px] rounded-[14px] px-1 text-[10px]" 
                    : "h-[46px] rounded-[18px] px-2 text-[12px] sm:text-[13px]",
                  isActive
                    ? "text-white border-white/30 shadow-[0_4px_12px_rgba(255,106,0,0.3)] scale-[1.02] font-black"
                    : "text-white/90 border-white/10 font-extrabold hover:bg-white/5",
                )}
                style={{
                  minWidth: 0,
                  background: isActive 
                    ? "var(--brand-gradient, linear-gradient(135deg, #FF6A00 0%, #FF8A00 100%))" 
                    : "rgba(255, 255, 255, 0.08)"
                }}
              >
                <span className="truncate w-full text-center px-1">
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
