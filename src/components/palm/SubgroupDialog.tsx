import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFeedback } from "@/hooks/use-feedback";
import type { Product } from "@/lib/types";
import type { Subgroup } from "./menu-subgroups";

interface Props {
  subgroup: Subgroup | null;
  products: Product[];
  onClose: () => void;
  onAdd: (product: Product) => void;
  getQty: (id: string) => number;
}

export const SubgroupDialog = ({ subgroup, products, onClose, onAdd, getQty }: Props) => {
  const { playFeedback } = useFeedback();

  return (
    <Dialog open={!!subgroup} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{subgroup?.label}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2">
          {products.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum item disponível.</p>
          )}
          {products.map((product) => {
            const qty = getQty(product.id);
            return (
              <button
                key={product.id}
                onClick={() => onAdd(product)}
                className="relative flex items-center justify-between rounded-lg bg-card border border-border p-4 text-left transition-all duration-150 active:scale-[0.97] min-h-[64px]"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-base text-foreground leading-tight">
                    {product.name}
                  </span>
                  <span className="mt-1 text-sm text-primary font-bold">
                    R$ {product.price.toFixed(2)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-primary">+ ADD</span>
                {qty > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {qty}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => {
            playFeedback("click");
            onClose();
          }}
          className="mt-2 w-full rounded-lg bg-primary p-3 text-base font-bold text-primary-foreground active:scale-[0.97] transition-transform min-h-[48px]"
        >
          Concluir
        </button>
      </DialogContent>
    </Dialog>
  );
};
