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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Escolha — {groupName}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-1.5">
          {sorted.map(({ name, product }) => {
            if (!product) {
              return (
                <div
                  key={name}
                  className="rounded-2xl border border-dashed border-border bg-muted/30 p-2.5 text-left opacity-60"
                >
                  <span className="font-bold text-base text-muted-foreground">{name}</span>
                  <p className="mt-0.5 text-[11px] text-muted-foreground italic">
                    Não cadastrado no admin
                  </p>
                </div>
              );
            }
            const esgotado = isEsgotado(product.id);
            const qty = getQty(product.id);
            return (
              <div
                key={name}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-2.5 gap-1.5 shadow-soft",
                  esgotado
                    ? "bg-muted/30 border-border opacity-60"
                    : "bg-card border-border"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-base text-foreground leading-tight">
                    {name}
                  </span>
                  {esgotado && (
                    <span className="text-[11px] italic text-muted-foreground shrink-0">
                      Indisponível
                    </span>
                  )}
                </div>
                <span className="text-base font-extrabold text-primary">
                  R$ {product.price.toFixed(2)}
                </span>
                <button
                  onClick={() => onPick(name, product)}
                  className={cn(
                    "w-full rounded-lg py-2 text-sm font-bold transition-transform active:scale-95",
                    esgotado
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  {esgotado ? "Indisponível" : "Adicionar"}
                </button>
                {qty > 0 && (
                  <span
                    key={qty}
                    className="absolute -top-2 -right-2 flex h-7 min-w-[28px] items-center justify-center rounded-full bg-brand-gradient text-sm font-black text-primary-foreground border-2 border-background px-1.5 shadow-glow animate-badge-pop"
                  >
                    {qty}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
