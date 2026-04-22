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
  groupIcon?: string;
  variants: GroupVariantEntry[];
  onPick: (variantName: string, product: Product) => void;
  isEsgotado: (productId: string) => boolean;
  getQty: (productId: string) => number;
}

export const GroupVariantDialog = ({
  open,
  onOpenChange,
  groupName,
  groupIcon = "📦",
  variants,
  onPick,
  isEsgotado,
  getQty,
}: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>
          <span className="mr-1">{groupIcon}</span> Escolha — {groupName}
        </DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-2">
        {variants.map(({ name, product }) => {
          if (!product) {
            return (
              <div
                key={name}
                className="rounded-2xl border border-dashed border-border bg-card/50 p-3 text-left opacity-60"
              >
                <span className="font-semibold text-base text-muted-foreground">{name}</span>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Não cadastrado no admin
                </p>
              </div>
            );
          }
          const esgotado = isEsgotado(product.id);
          const qty = getQty(product.id);
          return (
            <button
              key={name}
              onClick={() => onPick(name, product)}
              className={cn(
                "relative flex flex-col rounded-2xl border p-3 text-left transition-all duration-150 active:scale-[0.97] shadow-soft min-h-[64px]",
                esgotado
                  ? "bg-card/60 border-destructive/40 hover:border-destructive/60"
                  : "bg-card border-border hover:border-primary/40 active:bg-primary/10"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "font-semibold text-base leading-tight",
                    esgotado ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {name}
                </span>
                {esgotado && (
                  <span className="inline-flex items-center rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-destructive border border-destructive/40">
                    Esgotado
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-end justify-between gap-2">
                <span
                  className={cn(
                    "text-sm font-black",
                    esgotado ? "text-muted-foreground" : "brand-gradient-text"
                  )}
                >
                  R$ {product.price.toFixed(2)}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-sm font-black",
                    esgotado ? "text-destructive" : "text-primary"
                  )}
                >
                  {esgotado ? "+ Adicionar" : "+ ADD"}
                </span>
              </div>
              {qty > 0 && (
                <span
                  key={qty}
                  className="absolute -top-2 -right-2 flex h-7 min-w-[28px] items-center justify-center rounded-full bg-brand-gradient text-sm font-black text-primary-foreground border-2 border-background px-1.5 shadow-glow animate-badge-pop"
                >
                  {qty}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </DialogContent>
  </Dialog>
);
