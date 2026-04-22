import { Minus, Plus, Sliders, Pencil, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type InventoryItem, getStockStatus, formatQty } from "@/lib/inventory";
import { cn } from "@/lib/utils";

type Props = {
  item: InventoryItem;
  onMovement: (item: InventoryItem, type: "in" | "out" | "adjustment") => void;
  onEdit: (item: InventoryItem) => void;
  onHistory: (item: InventoryItem) => void;
};

export default function StockCard({ item, onMovement, onEdit, onHistory }: Props) {
  const status = getStockStatus(item);

  const borderClass =
    status === "zero"
      ? "border-l-destructive"
      : status === "low"
      ? "border-l-warning"
      : "border-l-border";

  return (
    <div
      className={cn(
        "rounded-xl bg-card border border-border border-l-4 p-4 shadow-card flex flex-col gap-3",
        borderClass
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-card-foreground truncate">{item.name}</h3>
          <p className="text-xs text-muted-foreground capitalize">
            {item.category} · {item.unit}
          </p>
        </div>
        {status === "zero" && <Badge variant="destructive">ZERADO</Badge>}
        {status === "low" && (
          <Badge className="bg-warning text-warning-foreground hover:bg-warning">BAIXO</Badge>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-foreground">
          {formatQty(item.current_stock, item.unit)}
        </span>
        <span className="text-xs text-muted-foreground">
          mín {formatQty(item.min_stock, item.unit)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <Button size="sm" variant="outline" onClick={() => onMovement(item, "out")} className="px-2">
          <Minus className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={() => onMovement(item, "in")} className="px-2">
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onMovement(item, "adjustment")} className="px-2">
          <Sliders className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onEdit(item)} className="px-2">
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
      <button
        onClick={() => onHistory(item)}
        className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start"
      >
        <History className="h-3 w-3" /> Histórico
      </button>
    </div>
  );
}
