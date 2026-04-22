import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApplyMovement } from "@/hooks/use-inventory";
import { type InventoryItem, formatQty } from "@/lib/inventory";
import { toast } from "@/hooks/use-toast";
import OutOfStockConfirmDialog from "./OutOfStockConfirmDialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: InventoryItem | null;
  type: "in" | "out" | "adjustment";
};

const TITLES = {
  in: "Entrada de estoque",
  out: "Saída de estoque",
  adjustment: "Ajuste de estoque",
};

export default function MovementDialog({ open, onOpenChange, item, type }: Props) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const apply = useApplyMovement();

  // Out-of-stock confirm flow
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCtx, setConfirmCtx] = useState<{
    name: string;
    productId: string;
    newStock: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setQty(type === "adjustment" && item ? String(item.current_stock) : "");
      setNote("");
    }
  }, [open, type, item]);

  if (!item) return null;

  const qtyNum = parseFloat(qty.replace(",", "."));
  const valid = !Number.isNaN(qtyNum) && qtyNum >= 0;

  const preview =
    !valid
      ? null
      : type === "in"
      ? item.current_stock + qtyNum
      : type === "out"
      ? item.current_stock - qtyNum
      : qtyNum;

  const handleConfirm = async () => {
    if (!valid) return;
    try {
      const result = await apply.mutateAsync({
        item_id: item.id,
        type,
        quantity: qtyNum,
        note: note.trim() || undefined,
      });
      toast({ title: "Movimentação registrada" });

      const wasAvailable = item.current_stock > 0;
      const now = result.new_stock;
      if (
        wasAvailable &&
        now <= 0 &&
        result.linked_product_id &&
        result.linked_product_active === true
      ) {
        setConfirmCtx({
          name: result.item_name ?? item.name,
          productId: result.linked_product_id,
          newStock: Number(now),
        });
        setConfirmOpen(true);
      }

      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const willGoNegative = preview !== null && preview < 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TITLES[type]}</DialogTitle>
            <DialogDescription>
              {item.name} · atual {formatQty(item.current_stock, item.unit)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="qty">
                {type === "adjustment" ? "Novo valor absoluto" : "Quantidade"} ({item.unit})
              </Label>
              <Input
                id="qty"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="text-2xl h-14 mt-1"
                autoFocus
              />
            </div>

            {valid && preview !== null && (
              <div
                className={
                  willGoNegative
                    ? "rounded-lg bg-destructive/10 border border-destructive/40 p-3 text-sm"
                    : "rounded-lg bg-muted p-3 text-sm"
                }
              >
                Estoque depois:{" "}
                <span className={willGoNegative ? "text-destructive font-bold" : "font-bold"}>
                  {formatQty(preview, item.unit)}
                </span>
                {willGoNegative && (
                  <span className="text-destructive ml-2">⚠ ficará negativo</span>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="note">Observação (opcional)</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!valid || apply.isPending}
              variant={willGoNegative ? "destructive" : "default"}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmCtx && (
        <OutOfStockConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          itemName={confirmCtx.name}
          productId={confirmCtx.productId}
          newStock={confirmCtx.newStock}
        />
      )}
    </>
  );
}
