import { useState, useEffect } from "react";
import { Minus, Plus, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PublicProduct } from "@/lib/public-menu";

interface Props {
  product: PublicProduct | null;
  open: boolean;
  onClose: () => void;
  onAdd: (product: PublicProduct, qty: number, note: string) => void;
}

export default function ProductDetailSheet({ product, open, onClose, onAdd }: Props) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setQty(1);
      setNote("");
    }
  }, [open, product?.id]);

  if (!product) return null;
  const blocked = product.is_sold_out;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl p-0">
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur"
        >
          <X size={18} />
        </button>
        {product.image_url && (
          <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        )}
        <SheetHeader className="px-5 pt-4 text-left">
          <SheetTitle className="text-2xl">{product.name}</SheetTitle>
          {product.description && (
            <p className="text-sm text-muted-foreground">{product.description}</p>
          )}
        </SheetHeader>

        <div className="px-5 pb-6 pt-3 space-y-4">
          <p className="text-2xl font-black brand-gradient-text">
            R$ {product.price.toFixed(2)}
          </p>

          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Observação
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="Ex: sem cebola, ponto da carne, etc."
              className="mt-1 resize-none"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 rounded-full bg-secondary p-1">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-background"
                aria-label="Diminuir"
              >
                <Minus size={18} />
              </button>
              <span className="w-6 text-center text-lg font-bold tabular-nums">{qty}</span>
              <button
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"
                aria-label="Aumentar"
              >
                <Plus size={18} />
              </button>
            </div>

            <Button
              size="lg"
              disabled={blocked}
              onClick={() => {
                onAdd(product, qty, note.trim());
                onClose();
              }}
              className="flex-1 h-14 text-base font-bold"
            >
              {blocked ? "Indisponível" : `Adicionar R$ ${(product.price * qty).toFixed(2)}`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
