import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { Order, OrderItem } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

interface Props {
  order: Order;
  onBack: () => void;
  onClosed: () => void;
}

const PAYMENT_METHODS = [
  { key: "cash", label: "💵 DINHEIRO" },
  { key: "pix", label: "📱 PIX" },
  { key: "card", label: "💳 CARTÃO" },
] as const;

const CloseOrder = ({ order, onBack, onClosed }: Props) => {
  const [method, setMethod] = useState<string>("");
  const [amountPaid, setAmountPaid] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

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
  const paid = parseFloat(amountPaid) || 0;
  const change = paid - total;

  const handleConfirm = async () => {
    if (!method || sending) return;
    setSending(true);

    try {
      await supabase
        .from("orders")
        .update({
          status: "paid",
          payment_method: method,
          amount_paid: method === "cash" ? paid : total,
        })
        .eq("id", order.id);

      toast({ title: "Pagamento confirmado!" });
      onClosed();
    } catch {
      toast({ title: "Erro", variant: "destructive" });
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col pb-28">
      <div className="border-b border-border p-4 flex items-center gap-4">
        <button onClick={onBack} className="text-muted-foreground">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">Fechar - {order.table_name}</h1>
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

      <div className="p-4 space-y-3">
        <p className="font-semibold text-base">Forma de pagamento:</p>
        <div className="grid grid-cols-3 gap-3">
          {PAYMENT_METHODS.map((pm) => (
            <button
              key={pm.key}
              onClick={() => setMethod(pm.key)}
              className={`rounded-lg border p-3 text-base font-semibold transition-all duration-150 active:scale-95 ${
                method === pm.key
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border bg-card text-foreground"
              }`}
            >
              {pm.label}
            </button>
          ))}
        </div>

        {method === "cash" && (
          <div className="space-y-2">
            <input
              type="number"
              placeholder="Valor recebido"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="w-full rounded-lg border border-border bg-card p-4 text-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {paid >= total && (
              <p className="text-lg font-bold text-success">
                Troco: R$ {change.toFixed(2)}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border">
        <button
          onClick={handleConfirm}
          disabled={!method || sending || (method === "cash" && paid < total)}
          className="w-full rounded-lg bg-success p-4 text-lg font-bold text-success-foreground active:scale-[0.97] transition-transform disabled:opacity-40 min-h-[56px]"
        >
          {sending ? "PROCESSANDO..." : "✅ CONFIRMAR PAGAMENTO"}
        </button>
      </div>
    </div>
  );
};

export default CloseOrder;
