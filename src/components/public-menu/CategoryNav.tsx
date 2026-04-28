import { useEffect, useRef, useState } from "react";
import { type MenuCategory } from "@/lib/public-menu";
import { cn } from "@/lib/utils";

type Props = {
  categories: MenuCategory[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
};

/**
 * Navegação de categorias em linha única (Tags):
 * - Uma única linha horizontal com scroll-snap.
 * - Tags compactas (estilo botão de pílula).
 * - Sticky modo ultra-compacto ao rolar.
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
    handleScroll();
    
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!categories.length) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "sticky z-40 w-full transition-all duration-300",
        // Ajusta o top se estiver no modo preview para não sobrepor o banner
        "top-0 [[data-preview-mode=true]_&]:top-[32px]",
        stuck 
          ? "bg-[#0A0504]/95 backdrop-blur-md border-b border-white/5 py-1.5 px-3" 
          : "bg-transparent py-3 px-0"
      )}
    >
      <div className="mx-auto max-w-3xl overflow-hidden">
        <div 
          className={cn(
            "flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory",
            stuck ? "justify-start" : "justify-between sm:justify-center"
          )}
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {categories.map((c) => {
            const isActive = activeSlug === c.slug;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.slug)}
                className={cn(
                  "transition-all duration-300 uppercase tracking-tight flex-shrink-0 snap-center",
                  "flex items-center justify-center whitespace-nowrap border",
                  "touch-manipulation select-none font-extrabold",
                  stuck 
                    ? "h-[30px] rounded-full px-2.5 text-[10px]" 
                    : "h-[42px] rounded-[18px] px-4 text-[12px] sm:text-[13px]",
                  isActive
                    ? "text-white border-transparent shadow-[0_4px_10px_rgba(255,106,0,0.25)] scale-[1.02]"
                    : "text-white/80 border-white/10 bg-white/5 hover:bg-white/10",
                )}
                style={{
                  background: isActive 
                    ? "var(--brand-gradient, linear-gradient(135deg, #FF6A00 0%, #FF8A00 100%))" 
                    : undefined,
                  fontSize: !stuck ? "clamp(11px, 2.8vw, 14px)" : "clamp(9px, 2.3vw, 11px)"
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
