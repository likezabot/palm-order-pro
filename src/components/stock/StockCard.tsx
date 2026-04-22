import { useEffect, useState } from "react";
import { Minus, Plus, Sliders, Pencil, History, EyeOff, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type InventoryItem, getStockStatus, formatQty } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToggleProductActive } from "@/hooks/use-inventory";
import { toast } from "@/hooks/use-toast";

type Props = {
  item: InventoryItem;
  onMovement: (item: InventoryItem, type: "in" | "out" | "adjustment") => void;
  onEdit: (item: InventoryItem) => void;
  onHistory: (item: InventoryItem) => void;
};

export default function StockCard({ item, onMovement, onEdit, onHistory }: Props) {
  const status = getStockStatus(item);
  const [productActive, setProductActive] = useState<boolean | null>(null);
  const toggle = useToggleProductActive();

  useEffect(() => {
    let cancelled = false;
    if (!item.product_id) {
      setProductActive(null);
      return;
    }
    supabase
      .from("products")
      .select("active")
      .eq("id", item.product_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProductActive(data?.active ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [item.product_id, item.updated_at]);

  const borderClass =
    status === "negative"
      ? "border-l-destructive animate-pulse"
      : status === "zero"
      ? "border-l-destructive"
      : status === "low"
      ? "border-l-warning"
      : "border-l-border";

  const handleReactivate = async () => {
    if (!item.product_id) return;
    try {
      await toggle.mutateAsync({ product_id: item.product_id, active: true });
      setProductActive(true);
      toast({ title: `${item.name} reativado no cardápio` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const isOutOfMenu = item.product_id && productActive === false;

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
            {item.product_id && <span className="ml-1 text-primary">· cardápio</span>}
          </p>
        </div>
        <div className="flex flex-col gap-1 items-end">
          {status === "negative" && <Badge variant="destructive">NEGATIVO</Badge>}
          {status === "zero" && <Badge variant="destructive">ZERADO</Badge>}
          {status === "low" && (
            <Badge className="bg-warning text-warning-foreground hover:bg-warning">BAIXO</Badge>
          )}
          {isOutOfMenu && (
            <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
              FORA DO CARDÁPIO
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-2xl font-black",
            status === "negative" || status === "zero" ? "text-destructive" : "text-foreground"
          )}
        >
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

      {isOutOfMenu && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleReactivate}
          disabled={toggle.isPending}
          className="w-full"
        >
          <Eye className="h-3.5 w-3.5 mr-1" /> Reativar no cardápio
        </Button>
      )}

      <button
        onClick={() => onHistory(item)}
        className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start"
      >
        <History className="h-3 w-3" /> Histórico
      </button>
    </div>
  );
}
