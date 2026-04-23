import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

export type GroupVariantEntry = {
  name: string;
  product: Product | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  variants: GroupVariantEntry[];
  onPick: (variantName: string, product: Product) => void;
  onPickDecrement?: (variantName: string, product: Product) => void;
  isEsgotado: (productId: string) => boolean;
  getQty: (productId: string) => number;
}

export const GroupVariantDialog = ({
  open,
  onOpenChange,
  groupName,
  variants,
  onPick,
  onPickDecrement,
  isEsgotado,
  getQty,
}: Props) => {
  // Sort: available first, esgotado/uncadastrado at the end (stable)
  const sorted = variants
    .map((v, idx) => {
      const status = !v.product ? 2 : isEsgotado(v.product.id) ? 1 : 0;
      return { v, idx, status };
    })
    .sort((a, b) => (a.status !== b.status ? a.status - b.status : a.idx - b.idx))
    .map((x) => x.v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl border-border/40 p-6 gap-0">
        <DialogHeader className="space-y-0 pb-3 border-b border-border/30">
          <DialogTitle className="text-[22px] font-medium tracking-tight text-foreground">
            {groupName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col divide-y divide-border/20">
          {sorted.map(({ name, product }) => {
            if (!product) {
              return (
                <div
                  key={name}
                  className="flex items-center justify-between gap-3 py-4 px-1"
                >
                  <span className="text-[15px] font-normal text-muted-foreground/70">{name}</span>
                  <span className="text-[13px] text-muted-foreground/40 tabular-nums">—</span>
                </div>
              );
            }
            const esgotado = isEsgotado(product.id);
            const qty = getQty(product.id);
            return (
              <button
                type="button"
                key={name}
                disabled={esgotado}
                onClick={() => onPick(name, product)}
                aria-label={`Adicionar ${name} — R$ ${product.price.toFixed(2)}`}
                className={cn(
                  "relative flex items-center justify-between gap-3 py-3 px-1 text-left transition-colors min-h-[56px]",
                  esgotado && "opacity-40 cursor-not-allowed",
                )}
              >
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[15px] font-normal text-foreground leading-snug tracking-tight truncate">
                    {name}
                  </span>
                  {qty > 0 && !esgotado && (
                    <span className="text-[12px] text-muted-foreground/60 tabular-nums leading-tight mt-0.5">
                      R$ {product.price.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="flex items-center shrink-0">
                  {esgotado ? (
                    <span className="text-[11px] text-muted-foreground/50">indisponível</span>
                  ) : qty > 0 && onPickDecrement ? (
                    <div className="inline-flex items-center rounded-full border border-border/50 bg-muted/30 h-9 px-1 gap-0.5">
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Remover 1 ${name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPickDecrement(name, product);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            onPickDecrement(name, product);
                          }
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                      >
                        <Minus size={14} />
                      </span>
                      <span
                        key={qty}
                        className="min-w-[24px] text-center text-[14px] font-medium tabular-nums text-foreground px-0.5 animate-badge-pop"
                      >
                        {qty}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Adicionar mais 1 ${name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPick(name, product);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            onPick(name, product);
                          }
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                      >
                        <Plus size={14} />
                      </span>
                    </div>
                  ) : (
                    <span className="text-[13px] text-muted-foreground/70 tabular-nums">
                      R$ {product.price.toFixed(2)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
