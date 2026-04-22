import { useNavigate } from "react-router-dom";
import { Package, ChevronRight } from "lucide-react";
import { useInventoryItems } from "@/hooks/use-inventory";
import { getStockStatus } from "@/lib/inventory";

export default function StockSummaryCard() {
  const navigate = useNavigate();
  const { data: items = [] } = useInventoryItems();

  const active = items.filter((i) => i.is_active);
  if (active.length === 0) return null;

  const low = active.filter((i) => getStockStatus(i) === "low").length;
  const zero = active.filter((i) => getStockStatus(i) === "zero").length;

  if (low === 0 && zero === 0) return null;

  return (
    <button
      onClick={() => navigate("/estoque?filter=low")}
      className="w-full max-w-sm rounded-xl border border-warning/40 bg-warning/5 p-3 flex items-center gap-3 active:scale-[0.98] transition-all animate-fade-in-up"
    >
      <Package className="h-5 w-5 text-warning shrink-0" />
      <div className="flex-1 text-left text-sm">
        <span className="font-semibold text-foreground">Estoque:</span>{" "}
        {zero > 0 && <span className="text-destructive font-bold">{zero} zerados</span>}
        {zero > 0 && low > 0 && <span className="text-muted-foreground"> · </span>}
        {low > 0 && <span className="text-warning font-bold">{low} baixos</span>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
