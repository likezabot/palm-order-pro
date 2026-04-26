import { useEffect, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  itemCount: number;
  total: number;
  onClick: () => void;
}

export default function PublicCartFab({ itemCount, total, onClick }: Props) {
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(itemCount);

  useEffect(() => {
    if (itemCount > prevCount.current) {
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 500);
      return () => window.clearTimeout(t);
    }
    prevCount.current = itemCount;
  }, [itemCount]);

  if (itemCount === 0) return null;

  return (
    <button
      onClick={onClick}
      aria-label={`Ver carrinho — ${itemCount} ${itemCount === 1 ? "item" : "itens"}`}
      style={{
        bottom: "calc(1rem + env(safe-area-inset-bottom))",
        left: "1rem",
        right: "1rem",
        background: "var(--brand-gradient)",
        boxShadow:
          "0 14px 40px -10px hsl(14 76% 46% / 0.55), 0 4px 14px -4px hsl(22 88% 52% / 0.35), inset 0 1px 0 hsl(0 0% 100% / 0.18)",
      }}
      className={cn(
        "fixed z-30 flex items-center justify-between gap-3 rounded-full px-5 py-4 font-bold text-primary-foreground active:scale-[0.98] transition-transform min-h-[60px]",
        "ring-1 ring-white/15",
        pulse && "animate-pulse-active",
      )}
    >
      <span className="flex items-center gap-2.5">
        <span
          className={cn(
            "relative flex h-8 min-w-[32px] items-center justify-center rounded-full bg-white/25 px-2 text-sm font-black backdrop-blur-sm transition-transform ring-1 ring-white/30",
            pulse && "scale-125",
          )}
        >
          {itemCount}
        </span>
        <ShoppingBag className="h-5 w-5 drop-shadow-sm" />
        <span className="tracking-wide">Ver carrinho</span>
      </span>
      <span className="flex items-center gap-3">
        <span aria-hidden className="h-6 w-px bg-white/30" />
        <span className="text-base font-black tabular-nums tracking-tight">
          R$ {total.toFixed(2)}
        </span>
      </span>
    </button>
  );
}
