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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.getBoundingClientRect().top;
      setStuck(top <= 1);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Faz scroll horizontal do botão ativo para dentro da visão
  useEffect(() => {
    if (!activeSlug || !scrollRef.current) return;
    const activeButton = scrollRef.current.querySelector('[data-active="true"]');
    if (activeButton) {
      activeButton.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center"
      });
    }
  }, [activeSlug]);

  if (!categories.length) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "sticky top-0 z-30 -mx-4 px-4 transition-all duration-300",
        stuck
          ? "border-b border-white/10 bg-black/80 backdrop-blur-xl shadow-xl translate-y-0"
          : "bg-transparent translate-y-0",
      )}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
      <div ref={scrollRef} className="flex flex-nowrap overflow-x-auto gap-3 py-4 no-scrollbar scroll-smooth">
        {categories.map((c) => {
          const isActive = activeSlug === c.slug;
          return (
            <button
              key={c.id}
              data-active={isActive}
              type="button"
              onClick={() => onSelect(c.slug)}
              className={cn(
                "shrink-0 rounded-full px-5 py-2.5 text-[13px] font-bold transition-all duration-300 uppercase tracking-tight",
                "min-h-[42px] flex items-center justify-center whitespace-nowrap border",
                isActive
                  ? "text-white border-white/30 shadow-[0_4px_12px_rgba(255,106,0,0.4)] scale-[1.05]"
                  : "text-white border-white/15 hover:bg-white/10 active:scale-95",
              )}
              style={
                isActive 
                  ? { background: "var(--brand-gradient)" } 
                  : { background: "rgba(255, 255, 255, 0.08)", borderColor: "rgba(255, 255, 255, 0.18)" }
              }
            >
              {c.name}
            </button>
          );
        })}
        {/* Espaçador final para garantir que o último item não cole na borda */}
        <div className="shrink-0 w-8 h-1" aria-hidden="true" />
      </div>
    </div>
  );
}
