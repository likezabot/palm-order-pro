import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PorcoVariantEntry = {
  name: string;
  product: Product | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variants: PorcoVariantEntry[];
  onPick: (variantName: string, product: Product) => void;
  isEsgotado: (productId: string) => boolean;
  getQty: (productId: string) => number;
}

export const PorcoVariantDialog = ({
  open,
  onOpenChange,
  variants,
  onPick,
  isEsgotado,
  getQty,
}: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Escolha o tipo de Porco</DialogTitle>
      </DialogHeader>
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-1 gap-2">
          {variants.map(({ name, product }) => {
            if (!product) {
              return (
                <Tooltip key={name}>
                  <TooltipTrigger asChild>
                    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-3 text-left opacity-60 cursor-help">
                      <span className="font-semibold text-base text-muted-foreground">{name}</span>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Não cadastrado no admin
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    <p className="text-[11px] font-semibold">Produto não encontrado</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Peça ao admin para criar "{name}" em Cardápio → Espetos para liberar
                      esta variante no popup.
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            }
            const esgotado = isEsgotado(product.id);
            const qty = getQty(product.id);
            return (
              <Tooltip key={name}>
                <TooltipTrigger asChild>
                  <button
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
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px]">
                  <p className="text-[11px] font-bold">{product.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    R$ {product.price.toFixed(2)}
                  </p>
                  {esgotado ? (
                    <p className="text-[11px] mt-1 text-destructive">
                      🚫 Estoque zerado/negativo. Ao tocar, o sistema pede confirmação antes
                      de adicionar.
                    </p>
                  ) : (
                    <p className="text-[11px] mt-1 text-foreground">
                      ✅ Disponível em estoque.
                    </p>
                  )}
                  {qty > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1 italic">
                      Já no carrinho: {qty}.
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </DialogContent>
  </Dialog>
);
