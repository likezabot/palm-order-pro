import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  isEsgotado: (productId: string) => boolean;
  getQty: (productId: string) => number;
}

export const GroupVariantDialog = ({
  open,
  onOpenChange,
  groupName,
  variants,
  onPick,
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
      <DialogContent className="max-w-sm rounded-3xl border-border/50 p-5 gap-3">
        <DialogHeader className="space-y-0.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70 font-medium">
            Escolha uma opção
          </p>
          <DialogTitle className="text-[20px] font-semibold tracking-tight">
            {groupName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col divide-y divide-border/40 -mx-1 mt-1">
          {sorted.map(({ name, product }) => {
            if (!product) {
              return (
                <div
                  key={name}
                  className="flex items-center justify-between gap-3 py-3 px-1 opacity-50"
                >
                  <span className="text-[15px] font-medium text-muted-foreground">{name}</span>
                  <span className="text-[11px] italic text-muted-foreground/70">
                    não cadastrado
                  </span>
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
                  "relative flex items-center justify-between gap-3 py-3.5 px-1 text-left transition-all active:scale-[0.99]",
                  esgotado && "opacity-40 cursor-not-allowed",
                )}
              >
                <span className="flex-1 min-w-0 text-[15px] font-medium text-foreground leading-snug">
                  {name}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  {esgotado && (
                    <span className="text-[11px] italic text-muted-foreground/70">
                      indisponível
                    </span>
                  )}
                  <span className="text-sm font-medium text-foreground/80 tabular-nums">
                    R$ {product.price.toFixed(2)}
                  </span>
                  {qty > 0 && (
                    <span
                      key={qty}
                      className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground px-1.5 animate-badge-pop tabular-nums"
                    >
                      {qty}
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
