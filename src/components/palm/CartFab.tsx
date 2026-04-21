import { ShoppingCart } from "lucide-react";
import { useFeedback } from "@/hooks/use-feedback";

interface Props {
  itemCount: number;
  total: number;
  onClick: () => void;
}

export const CartFab = ({ itemCount, total, onClick }: Props) => {
  const { playFeedback } = useFeedback();
  if (itemCount === 0) return null;
  return (
    <button
      onClick={() => {
        playFeedback("click");
        onClick();
      }}
      aria-label={`Ver pedido — ${itemCount} ${itemCount === 1 ? "item" : "itens"} — R$ ${total.toFixed(2)}`}
      className="fixed bottom-5 right-5 z-20 flex items-center gap-3 rounded-full bg-brand-gradient pl-5 pr-6 py-4 font-bold text-primary-foreground shadow-glow active:scale-[0.95] transition-transform duration-150 min-h-[64px] ring-4 ring-primary/20 animate-scale-in"
    >
      <div className="relative">
        <ShoppingCart size={26} />
        <span className="absolute -top-2 -right-3 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-black text-destructive-foreground border-2 border-primary">
          {itemCount}
        </span>
      </div>
      <span className="text-base font-black tabular-nums">
        R$ {total.toFixed(2)}
      </span>
    </button>
  );
};
