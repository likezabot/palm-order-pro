import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Printer, CheckCircle2 } from "lucide-react";
import { Order, OrderItem } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";
import { formatTableLabel } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  order: Order;
  onBack: () => void;
  onClosed: () => void;
}

const CloseOrder = ({ order, onBack, onClosed }: Props) => {
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { toast } = useToast();
  const { playFeedback } = useFeedback();

  const { data: items = [] } = useQuery({
    queryKey: ["order-items", order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", order.id);
      if (error) throw error;
      return data as OrderItem[];
    },
  });

  const total = order.total || 0;

  const handleConfirm = async (shouldPrint: boolean) => {
    if (sending) return;
    setSending(true);
    setShowConfirm(false);

    try {
      const { error } = await supabase.rpc("pay_order", {
        p_order_id: order.id,
        p_payment_method: "none",
        p_amount_paid: total,
        p_should_print: shouldPrint,
      });

      if (error) throw error;

      playFeedback("success");
      toast({ title: "Mesa fechada!" });
      onClosed();
    } catch (err) {
      console.error(err);
      playFeedback("error");
      toast({ title: "Erro ao fechar conta", variant: "destructive" });
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col pb-28">
      <div className="border-b border-border p-4 flex items-center gap-4">
        <button
          onClick={() => {
            playFeedback("click");
            onBack();
          }}
          className="text-muted-foreground"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">Fechar - {formatTableLabel(order.table_name, order.original_table_name)}</h1>
      </div>

      <div className="p-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between text-base">
            <span>{item.quantity}x {item.product_name}</span>
            <span className="font-semibold">R$ {item.subtotal.toFixed(2)}</span>
          </div>
        ))}

        <div className="border-t border-border pt-3 flex justify-between text-lg font-bold">
          <span>TOTAL</span>
          <span className="text-primary">R$ {total.toFixed(2)}</span>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border">
        <button
          onClick={() => {
            playFeedback("click");
            setShowConfirm(true);
          }}
          disabled={sending}
          className="w-full rounded-lg bg-success p-4 text-lg font-bold text-success-foreground active:scale-[0.97] transition-transform disabled:opacity-40 min-h-[56px]"
        >
          {sending ? "PROCESSANDO..." : "✅ FECHAR MESA"}
        </button>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="max-w-[90vw] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Deseja imprimir?</AlertDialogTitle>
            <AlertDialogDescription>
              Escolha se deseja fechar a conta com ou sem a impressão do comprovante.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
            <button
              onClick={() => handleConfirm(true)}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary p-4 text-lg font-bold text-primary-foreground active:scale-[0.98] transition-all"
            >
              <Printer size={20} /> Fechar e imprimir
            </button>
            <button
              onClick={() => handleConfirm(false)}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-secondary p-4 text-lg font-bold text-secondary-foreground active:scale-[0.98] transition-all"
            >
              <CheckCircle2 size={20} /> Fechar sem imprimir
            </button>
            <AlertDialogCancel className="w-full rounded-xl p-4 h-auto text-base border-none text-muted-foreground">
              Cancelar
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CloseOrder;
