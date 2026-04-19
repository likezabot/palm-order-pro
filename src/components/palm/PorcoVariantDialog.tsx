import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PORCO_VARIANTS } from "./menu-subgroups";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (variant: string) => void;
}

export const PorcoVariantDialog = ({ open, onOpenChange, onPick }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Escolha o tipo de Porco</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-2">
        {PORCO_VARIANTS.map((variant) => (
          <button
            key={variant}
            onClick={() => onPick(variant)}
            className="rounded-lg bg-card border border-border p-4 text-left font-semibold text-foreground active:scale-[0.97] transition-transform min-h-[56px]"
          >
            {variant}
          </button>
        ))}
      </div>
    </DialogContent>
  </Dialog>
);
