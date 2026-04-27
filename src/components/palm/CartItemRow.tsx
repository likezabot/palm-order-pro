import { memo, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { CartItem } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";
import { ConfirmRemoveDialog } from "./ConfirmRemoveDialog";

interface Props {
  item: CartItem;
  showWaiterTag: boolean;
  fallbackWaiter: string;
  /** Quantidade já enviada/persistida — não pode ser removida pelo "−". */
  originalQty?: number;
  /** Quantidade nova (em rascunho) ainda não enviada. */
  addedQty?: number;
  /** Garçom da última inserção desse produto (para mostrar "X levou por último"). */
  lastWaiter?: string;
  /** ISO timestamp da última inserção. */
  lastAddedAt?: string;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onUpdateNote: (productId: string, note: string) => void;
  onRemove: (productId: string) => void;
}

const formatHHmm = (iso?: string) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const CartItemRow = ({
  item,
  showWaiterTag,
  fallbackWaiter,
  originalQty = 0,
  addedQty,
  lastWaiter,
  lastAddedAt,
  onUpdateQuantity,
  onUpdateNote,
  onRemove,
}: Props) => {
  const { playFeedback } = useFeedback();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const effectiveAdded = addedQty ?? Math.max(0, item.quantity - originalQty);
  const isLockedTotally = originalQty > 0 && effectiveAdded === 0;
  const canDecrement = effectiveAdded > 0;
  const lastTime = formatHHmm(lastAddedAt);

  return (
    <div className="rounded-xl bg-card border border-border/70 p-3 shadow-soft transition-all hover:border-border animate-fade-in-up">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-base">{item.product.name}</p>
          <p className="text-sm font-black brand-gradient-text">
            R$ {(item.product.price * item.quantity).toFixed(2)}
          </p>
          {effectiveAdded > 0 && originalQty > 0 && (
            <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide font-bold text-success bg-success/15 px-1.5 py-0.5 rounded">
              +{effectiveAdded} novo
            </span>
          )}
          {originalQty > 0 && lastWaiter && lastTime && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {lastWaiter} levou por último às {lastTime}
            </p>
          )}
          {showWaiterTag && (item.waiter_name || fallbackWaiter) && (item.waiter_name || fallbackWaiter) !== fallbackWaiter && (
            <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide font-bold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
              por {item.waiter_name || fallbackWaiter}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (!canDecrement) return;
              playFeedback("click");
              onUpdateQuantity(item.product.id, -1);
            }}
            disabled={!canDecrement}
            title={!canDecrement ? "Item já enviado — não pode ser removido aqui" : undefined}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-90 transition-transform disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
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
        disabled={isLockedTotally}
        className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/60 focus:border-ring transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {!isLockedTotally && (
        <button
          onClick={() => {
            playFeedback("heavy");
            setConfirmOpen(true);
          }}
          className="mt-2 flex items-center gap-1 text-sm text-destructive font-semibold hover:underline"
        >
          <Trash2 size={14} /> REMOVER
        </button>
      )}

      <ConfirmRemoveDialog
        open={confirmOpen}
        productName={item.product.name}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          // Se há addedQty, só remove o delta novo; se não há original, remove tudo.
          if (originalQty > 0 && effectiveAdded > 0) {
            onUpdateQuantity(item.product.id, -effectiveAdded);
          } else {
            onRemove(item.product.id);
          }
        }}
      />
    </div>
  );
};

export default memo(CartItemRow, (prev, next) => {
  return (
    prev.item.product.id === next.item.product.id &&
    prev.item.quantity === next.item.quantity &&
    prev.item.note === next.item.note &&
    prev.item.waiter_name === next.item.waiter_name &&
    prev.item.product.price === next.item.product.price &&
    prev.showWaiterTag === next.showWaiterTag &&
    prev.fallbackWaiter === next.fallbackWaiter &&
    prev.originalQty === next.originalQty &&
    prev.addedQty === next.addedQty &&
    prev.lastWaiter === next.lastWaiter &&
    prev.lastAddedAt === next.lastAddedAt &&
    prev.onUpdateQuantity === next.onUpdateQuantity &&
    prev.onUpdateNote === next.onUpdateNote &&
    prev.onRemove === next.onRemove
  );
});
