import { Minus, Plus, Trash2 } from "lucide-react";
import { CartItem } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";

interface Props {
  item: CartItem;
  showWaiterTag: boolean;
  fallbackWaiter: string;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onUpdateNote: (productId: string, note: string) => void;
  onRemove: (productId: string) => void;
}

const CartItemRow = ({
  item,
  showWaiterTag,
  fallbackWaiter,
  onUpdateQuantity,
  onUpdateNote,
  onRemove,
}: Props) => {
  const { playFeedback } = useFeedback();

  return (
    <div className="rounded-xl bg-card border border-border/70 p-3 shadow-soft transition-all hover:border-border animate-fade-in-up">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-base">{item.product.name}</p>
          <p className="text-sm font-black brand-gradient-text">
            R$ {(item.product.price * item.quantity).toFixed(2)}
          </p>
          {showWaiterTag && (item.waiter_name || fallbackWaiter) && (item.waiter_name || fallbackWaiter) !== fallbackWaiter && (
            <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide font-bold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
              por {item.waiter_name || fallbackWaiter}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              playFeedback("click");
              onUpdateQuantity(item.product.id, -1);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-90 transition-transform"
          >
            <Minus size={18} />
          </button>
          <span className="text-lg font-bold w-6 text-center tabular-nums">{item.quantity}</span>
          <button
            onClick={() => {
              playFeedback("click");
              onUpdateQuantity(item.product.id, 1);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary active:scale-90 transition-transform"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Observação (ex: sem cebola)"
        value={item.note}
        onChange={(e) => onUpdateNote(item.product.id, e.target.value)}
        className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/60 focus:border-ring transition-all"
      />

      <button
        onClick={() => {
          playFeedback("heavy");
          onRemove(item.product.id);
        }}
        className="mt-2 flex items-center gap-1 text-sm text-destructive font-semibold hover:underline"
      >
        <Trash2 size={14} /> REMOVER
      </button>
    </div>
  );
};

export default CartItemRow;
