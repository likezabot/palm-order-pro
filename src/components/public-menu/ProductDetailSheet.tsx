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
import { cn } from "@/lib/utils";
import type { PublicProduct } from "@/lib/public-menu";

interface Props {
  product: PublicProduct | null;
  open: boolean;
  onClose: () => void;
  onAdd: (product: PublicProduct, qty: number, note: string) => void;
}

const QUICK_QUANTITIES = [1, 2, 3, 5, 10];

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
  const lineTotal = product.price * qty;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[94vh] overflow-y-auto rounded-t-2xl p-0"
      >
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
          <SheetTitle className="text-2xl leading-tight text-black">{product.name}</SheetTitle>
          {product.description && (
            <p className="text-sm text-black/60">{product.description}</p>
          )}
        </SheetHeader>

        <div
          className="px-5 pt-3 pb-6 space-y-4"
          style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
          <p className="text-2xl font-black text-black">
            R$ {product.price.toFixed(2)}
          </p>

          {/* Atalhos rápidos */}
          <div>
            <div className="text-xs font-bold uppercase text-black/60 mb-2">
              Quantidade
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_QUANTITIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQty(q)}
                  aria-pressed={qty === q}
                  className={cn(
                    "min-w-[52px] h-11 rounded-xl px-3 text-base font-bold tabular-nums transition-colors border-2",
                    qty === q
                      ? "border-primary bg-primary text-black"
                      : "border-border bg-secondary text-black hover:bg-muted",
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Stepper grande -/+ */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-2xl bg-secondary p-1.5">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-background active:scale-95 transition-transform"
                aria-label="Diminuir"
              >
                <Minus size={22} />
              </button>
              <span className="w-10 text-center text-xl font-black tabular-nums text-black">
                {qty}
              </span>
              <button
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground active:scale-95 transition-transform"
                aria-label="Aumentar"
              >
                <Plus size={22} />
              </button>
            </div>
            <div className="flex-1 text-right">
              <div className="text-xs uppercase text-black/60">Total</div>
              <div className="text-lg font-black text-black">R$ {lineTotal.toFixed(2)}</div>
            </div>
          </div>

          {/* Observação */}
          <div>
            <label className="text-xs font-bold uppercase text-black/60">
              Observação (opcional)
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="Ex: sem cebola, bem passado, etc."
              className="mt-1 resize-none"
              rows={2}
            />
          </div>

          {/* CTA */}
          <Button
            size="lg"
            disabled={blocked}
            onClick={() => {
              onAdd(product, qty, note.trim());
              onClose();
            }}
            className="w-full h-14 text-base font-bold"
          >
            {blocked
              ? "Indisponível"
              : `Adicionar ${qty} • R$ ${lineTotal.toFixed(2)}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
