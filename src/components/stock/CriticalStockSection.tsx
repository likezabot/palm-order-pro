import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  type InventoryItem,
  getStockStatus,
  formatQty,
  sortByCriticality,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";

type Props = {
  items: InventoryItem[];
  onRepor: (item: InventoryItem) => void;
};

/**
 * Returns the critical set: all negatives + all zeros + top 5 lowest-margin "low" items.
 */
export function getCriticalItems(items: InventoryItem[]): InventoryItem[] {
  const active = items.filter((i) => i.is_active);
  const negatives = active.filter((i) => getStockStatus(i) === "negative");
  const zeros = active.filter((i) => getStockStatus(i) === "zero");
  const lows = sortByCriticality(active.filter((i) => getStockStatus(i) === "low")).slice(0, 5);
  return [...sortByCriticality(negatives), ...zeros, ...lows];
}

export default function CriticalStockSection({ items, onRepor }: Props) {
  const critical = getCriticalItems(items);

  if (critical.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        ✅ Nenhum item crítico no momento.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-bold text-destructive px-1">
        <AlertTriangle className="h-4 w-4" />
        Atenção: {critical.length} {critical.length === 1 ? "item crítico" : "itens críticos"}
      </div>
      <div className="flex flex-col gap-1.5">
        {critical.map((item) => {
          const status = getStockStatus(item);
          return (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg bg-card border border-border p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{item.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  <span
                    className={cn(
                      "font-bold",
                      status === "negative" && "text-destructive",
                      status === "zero" && "text-destructive",
                      status === "low" && "text-warning"
                    )}
                  >
                    {formatQty(item.current_stock, item.unit)}
                  </span>{" "}
                  · mín {formatQty(item.min_stock, item.unit)}
                </p>
              </div>
              {status === "negative" && (
                <Badge variant="destructive" className="text-[10px]">NEG</Badge>
              )}
              {status === "zero" && (
                <Badge variant="destructive" className="text-[10px]">ZERO</Badge>
              )}
              {status === "low" && (
                <Badge className="bg-warning text-warning-foreground hover:bg-warning text-[10px]">
                  BAIXO
                </Badge>
              )}
              <Button size="sm" onClick={() => onRepor(item)} className="h-8 px-2">
                <Plus className="h-3.5 w-3.5 mr-1" /> Repor
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
