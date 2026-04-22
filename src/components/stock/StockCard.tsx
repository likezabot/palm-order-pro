import { useEffect, useState } from "react";
import { Minus, Plus, Sliders, Pencil, Eye } from "lucide-react";
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
      ? "border-destructive/60"
      : status === "zero"
      ? "border-destructive/60"
      : status === "low"
      ? "border-warning/60"
      : "border-border";

  const valueClass =
    status === "negative" || status === "zero"
      ? "text-destructive"
      : status === "low"
      ? "text-warning"
      : "brand-gradient-text";

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

  const isOutOfMenu = !!item.product_id && productActive === false;

  return (
    <div
      data-stock-item-id={item.id}
      className={cn(
        "relative flex flex-col rounded-2xl bg-card border p-3 shadow-soft hover:shadow-card transition-all",
        borderClass,
        status === "negative" && "animate-pulse"
      )}
    >
      {/* Status badge — top-right */}
      {(status !== "ok" || isOutOfMenu) && (
        <div className="absolute -top-2 -right-2 flex flex-col items-end gap-1">
          {status === "negative" && (
            <Badge variant="destructive" className="text-[9px] h-4 px-1.5 font-black">
              NEG
            </Badge>
          )}
          {status === "zero" && (
            <Badge variant="destructive" className="text-[9px] h-4 px-1.5 font-black">
              ZERO
            </Badge>
          )}
          {status === "low" && (
            <Badge className="bg-warning text-warning-foreground hover:bg-warning text-[9px] h-4 px-1.5 font-black">
              BAIXO
            </Badge>
          )}
          {isOutOfMenu && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 border-destructive text-destructive">
              FORA
            </Badge>
          )}
        </div>
      )}

      <span className="font-semibold text-sm text-foreground leading-tight pr-6 line-clamp-2 min-h-[2.4em]">
        {item.name}
      </span>

      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn("text-lg font-black leading-none", valueClass)}>
          {formatQty(item.current_stock, item.unit)}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground mt-0.5">
        mín {formatQty(item.min_stock, item.unit)}
        {item.product_id && <span className="ml-1 text-primary">· cardápio</span>}
      </span>

      {/* Action footer */}
      <div className="mt-2 grid grid-cols-4 gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => { e.stopPropagation(); onMovement(item, "out"); }}
          className="h-8 px-0"
          aria-label="Saída"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          onClick={(e) => { e.stopPropagation(); onMovement(item, "in"); }}
          className="h-8 px-0"
          aria-label="Entrada"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => { e.stopPropagation(); onMovement(item, "adjustment"); }}
          className="h-8 px-0"
          aria-label="Ajuste"
        >
          <Sliders className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); onHistory(item); }}
          onDoubleClick={(e) => { e.stopPropagation(); onEdit(item); }}
          className="h-8 px-0"
          aria-label="Editar"
          title="Toque: histórico · Duplo toque: editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isOutOfMenu && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleReactivate}
          disabled={toggle.isPending}
          className="mt-2 h-7 text-[11px] w-full"
        >
          <Eye className="h-3 w-3 mr-1" /> Reativar
        </Button>
      )}
    </div>
  );
}
