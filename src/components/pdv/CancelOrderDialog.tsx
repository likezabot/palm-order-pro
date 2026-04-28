import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, X } from "lucide-react";
import { cancelOrder } from "@/lib/order-actions";
import { useToast } from "@/hooks/use-toast";
import { formatTableLabel } from "@/lib/utils";
import type { Order } from "@/lib/types";

interface CancelOrderDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled?: () => void;
}

const QUICK_REASONS = [
  "Cliente desistiu",
  "Erro no pedido",
  "Produto indisponível",
  "Demora excessiva",
];

export const CancelOrderDialog = ({ order, open, onOpenChange, onCancelled }: CancelOrderDialogProps) => {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setSubmitting(false);
    }
  }, [open]);

  if (!order) return null;

  const isAdvanced = order.status === "preparing" || order.status === "done";

  const handleConfirm = async () => {
    if (!order || submitting) return;
    setSubmitting(true);
    try {
      await cancelOrder(order.id, reason);
      toast({
        title: "Pedido cancelado",
        description: `${formatTableLabel(order.table_name, order.original_table_name)} — removido das estatísticas.`,
      });
      onCancelled?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Erro ao cancelar",
        description: e?.message || "Tente novamente.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex justify-center mb-2">
            <div className="rounded-full p-3 ring-4 bg-destructive/10 ring-destructive/5">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
          </div>
          <AlertDialogTitle className="text-center text-xl font-black uppercase text-destructive">
            CANCELAR PEDIDO?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-sm">
            <span className="block font-bold text-foreground text-base">
              {formatTableLabel(order.table_name, order.original_table_name)}
              {order.customer_name_snapshot ? ` · ${order.customer_name_snapshot}` : ""}
            </span>
            <span className="block mt-1">
              Total: <span className="font-bold text-foreground">R$ {(order.total || 0).toFixed(2)}</span>
            </span>
            
            {isAdvanced && (
              <span className="block mt-2 text-warning font-semibold">
                ⚠ Este pedido já está {order.status === "done" ? "pronto" : "em preparo"}.
              </span>
            )}
            <span className="block mt-2 text-destructive font-black uppercase tracking-tighter">
              ESTA AÇÃO NÃO PODE SER DESFEITA.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
              Motivo (opcional)
            </label>
            <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`text-[11px] font-bold px-2 py-1 rounded-full border transition-colors ${
                    reason === r
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo do cancelamento..."
              rows={2}
              className="w-full rounded-lg border border-border bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>

        <AlertDialogFooter className="gap-2 sm:flex-col lg:flex-row">
          <AlertDialogCancel disabled={submitting} className="min-h-[48px] flex-1">
            Voltar
          </AlertDialogCancel>
          
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 rounded-md bg-destructive px-4 py-2 font-black text-destructive-foreground disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2 hover:bg-destructive/90 transition-colors shadow-lg"
          >
            {submitting ? (
              "CANCELANDO..."
            ) : (
              <>
                <X className="w-5 h-5" /> CONFIRMAR CANCELAMENTO
              </>
            )}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};