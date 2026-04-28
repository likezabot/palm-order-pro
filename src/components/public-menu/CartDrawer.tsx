import { Minus, Plus, Trash2, Gift } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { PublicCartItem } from "@/lib/public-cart";
import { fetchLoyaltyEnabled } from "@/lib/loyalty";

interface Props {
  open: boolean;
  onClose: () => void;
  items: PublicCartItem[];
  subtotal: number;
  onUpdateQty: (productId: string, note: string | undefined, delta: number) => void;
  onRemove: (productId: string, note: string | undefined) => void;
  onCheckout: () => void;
}

export default function CartDrawer({
  open, onClose, items, subtotal, onUpdateQty, onRemove, onCheckout,
}: Props) {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchLoyaltyEnabled().then((v) => {
      if (!cancelled) setLoyaltyEnabled(v);
    });
    return () => { cancelled = true; };
  }, []);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[88vh] flex flex-col rounded-t-2xl p-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle className="text-black">Seu pedido</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {items.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              Seu carrinho está vazio
            </p>
          )}
          {items.map((it) => (
            <div
              key={`${it.product_id}-${it.note ?? ""}`}
              className="flex gap-3 rounded-xl border border-border p-3"
            >
              {it.image_url && (
                <img
                  src={it.image_url}
                  alt={it.product_name}
                  className="h-16 w-16 rounded-lg object-cover"
                  loading="lazy"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{it.product_name}</p>
                {it.note && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{it.note}</p>
                )}
                <p className="text-sm font-bold brand-gradient-text mt-0.5">
                  R$ {(it.product_price * it.quantity).toFixed(2)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => onUpdateQty(it.product_id, it.note, -1)}
                    aria-label="Diminuir"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm font-bold tabular-nums">
                    {it.quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQty(it.product_id, it.note, 1)}
                    aria-label="Aumentar"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => onRemove(it.product_id, it.note)}
                    aria-label="Remover"
                    className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <div className="border-t border-border px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-xl font-black tabular-nums">
                R$ {subtotal.toFixed(2)}
              </span>
            </div>
            <Button onClick={onCheckout} size="lg" className="w-full h-14 text-base font-bold">
              Continuar para o pedido
            </Button>
            {loyaltyEnabled && slug && (
              <button
                type="button"
                onClick={() => { onClose(); nav(`/menu/${slug}/pontos`); }}
                className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Gift size={13} />
                Ver meus pontos
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
