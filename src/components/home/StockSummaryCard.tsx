import { useNavigate } from "react-router-dom";
import { Package, ChevronRight } from "lucide-react";
import { useInventoryItems } from "@/hooks/use-inventory";
import { getStockStatus } from "@/lib/inventory";
import { cn } from "@/lib/utils";

export default function StockSummaryCard() {
  const navigate = useNavigate();
  const { data: items = [] } = useInventoryItems();

  const active = items.filter((i) => i.is_active);
  if (active.length === 0) return null;

  const negative = active.filter((i) => getStockStatus(i) === "negative").length;
  const zero = active.filter((i) => getStockStatus(i) === "zero").length;
  const low = active.filter((i) => getStockStatus(i) === "low").length;

  if (negative === 0 && low === 0 && zero === 0) return null;

  const hasUrgent = negative > 0 || zero > 0;

  return (
    <button
      onClick={() => navigate("/estoque?filter=critical")}
      className={cn(
        "w-full max-w-sm rounded-xl border p-3 flex items-center gap-3 active:scale-[0.98] transition-all animate-fade-in-up",
        hasUrgent
          ? "border-destructive/40 bg-destructive/5"
          : "border-warning/40 bg-warning/5"
      )}
    >
      <Package
        className={cn(
          "h-5 w-5 shrink-0",
          hasUrgent ? "text-destructive" : "text-warning"
        )}
      />
      <div className="flex-1 text-left text-sm flex flex-wrap items-baseline gap-x-1">
        <span className="font-semibold text-foreground">Estoque:</span>
        {negative > 0 && (
          <span className="text-destructive font-bold">{negative} negativos</span>
        )}
        {negative > 0 && (zero > 0 || low > 0) && (
          <span className="text-muted-foreground">·</span>
        )}
        {zero > 0 && (
          <span className="text-destructive font-bold">{zero} zerados</span>
        )}
        {zero > 0 && low > 0 && <span className="text-muted-foreground">·</span>}
        {low > 0 && <span className="text-warning font-bold">{low} baixos</span>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
