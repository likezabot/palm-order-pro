import { ShoppingBag } from "lucide-react";

interface Props {
  itemCount: number;
  total: number;
  onClick: () => void;
}

export default function PublicCartFab({ itemCount, total, onClick }: Props) {
  if (itemCount === 0) return null;
  return (
    <button
      onClick={onClick}
      aria-label={`Ver carrinho — ${itemCount} ${itemCount === 1 ? "item" : "itens"}`}
      style={{
        bottom: "calc(1rem + env(safe-area-inset-bottom))",
        left: "1rem",
        right: "1rem",
      }}
      className="fixed z-30 flex items-center justify-between gap-3 rounded-full bg-primary px-5 py-4 font-bold text-primary-foreground shadow-glow active:scale-[0.98] transition-transform min-h-[60px]"
    >
      <span className="flex items-center gap-2">
        <span className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-primary-foreground/20 px-2 text-sm">
          {itemCount}
        </span>
        <span>Ver carrinho</span>
      </span>
      <span className="text-base tabular-nums">R$ {total.toFixed(2)}</span>
    </button>
  );
}
