import { useEffect, useRef, useState } from "react";
import { type MenuCategory } from "@/lib/public-menu";
import { cn } from "@/lib/utils";

type Props = {
  categories: MenuCategory[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
};

/**
 * Navegação de categorias definitiva (sem scroll horizontal):
 * - Grid responsiva que cabe tudo na tela.
 * - Versão compacta quando sticky.
 * - Cores otimizadas para contraste.
 */
export default function CategoryNav({ categories, activeSlug, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      // Usamos window.scrollY para detectar se passou do ponto inicial
      // Ou melhor, observamos a posição do container original
      const rect = el.getBoundingClientRect();
      // Se o container subir além do topo, ativamos o modo stuck
      // Mas como ele muda para 'fixed', precisamos de um marcador ou lógica baseada em scrollY
      if (window.scrollY > 400) { // Valor aproximado após o Hero
         setStuck(true);
      } else {
         setStuck(false);
      }
    };
    
    // Uma abordagem melhor para sticky sem pulos é manter o elemento no fluxo 
    // e usar classes do Tailwind 'sticky top-0'
    const handleScroll = () => {
      if (!containerRef.current) return;
      const top = containerRef.current.getBoundingClientRect().top;
      setStuck(top <= 0);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
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
                    ? "h-[38px] rounded-[12px] px-1 text-[10px]" 
                    : "h-[44px] rounded-[16px] px-2 text-[12px]",
                  isActive
                    ? "text-white border-white/30 shadow-[0_4px_12px_rgba(255,106,0,0.2)] scale-[1.02] font-black"
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
