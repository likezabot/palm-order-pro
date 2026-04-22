import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useInventoryMovements } from "@/hooks/use-inventory";
import { type InventoryItem, SOURCE_LABEL, TYPE_LABEL, formatQty } from "@/lib/inventory";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: InventoryItem | null;
};

export default function HistoryDialog({ open, onOpenChange, item }: Props) {
  const { data: movements = [], isLoading } = useInventoryMovements(open && item ? item.id : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico</DialogTitle>
          <DialogDescription>{item?.name}</DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && movements.length === 0 && (
          <p className="text-sm text-muted-foreground">Sem movimentações.</p>
        )}

        <div className="flex flex-col divide-y divide-border">
          {movements.map((m) => {
            const sign = m.movement_type === "in" ? "+" : m.movement_type === "out" ? "−" : "=";
            const colorClass =
              m.movement_type === "in"
                ? "text-success"
                : m.movement_type === "out"
                ? "text-destructive"
                : "text-foreground";
            return (
              <div key={m.id} className="py-2 flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">
                    <span className={colorClass}>{TYPE_LABEL[m.movement_type]}</span>{" "}
                    <span className={colorClass}>
                      {sign} {item ? formatQty(m.quantity, item.unit) : m.quantity}
                    </span>
                  </div>
                  {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
                  <p className="text-[10px] text-muted-foreground/70">
                    {SOURCE_LABEL[m.source]} · {new Date(m.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
