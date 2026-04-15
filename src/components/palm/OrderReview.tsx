import { useState } from "react";
import { ArrowLeft, Minus, Plus, Trash2, Printer, FileText, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CartItem } from "@/lib/types";
import { calculateDelta } from "@/lib/order-delta";
import { printReceipt, printDelta, printBill } from "@/lib/print-receipt";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";

interface Props {
  tableName: string;
  waiterName: string;
  cart: CartItem[];
  originalCart?: CartItem[];
  total: number;
  existingOrderId?: string | null;
  senha?: string;
  onBack: () => void;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onUpdateNote: (productId: string, note: string) => void;
  onRemove: (productId: string) => void;
  onSuccess: (senha: string) => void;
}

const OrderReview = ({
  tableName, waiterName, cart, originalCart = [], total, existingOrderId, senha, onBack,
  onUpdateQuantity, onUpdateNote, onRemove, onSuccess,
}: Props) => {
  const [sending, setSending] = useState(false);
  const { toast } = useToast();
  const { playFeedback } = useFeedback();

  const handleFinalize = async () => {
    if (sending || cart.length === 0) return;
    setSending(true);

    try {
      if (existingOrderId) {
        // Calcular delta (acréscimos)
        const delta = calculateDelta(originalCart, cart);
        console.log("[OrderReview] Delta calculado:", delta);

        // Atomic update via RPC — delete + insert in a single transaction
        const items = cart.map((item) => ({
          product_id: item.product.id.length === 36 ? item.product.id : null,
          product_name: item.product.name,
          product_price: item.product.price,
          quantity: item.quantity,
          note: item.note || null,
          subtotal: item.product.price * item.quantity,
        }));
        const { error: rpcError } = await supabase.rpc("update_order_items", {
          p_order_id: existingOrderId,
          p_total: total,
          p_items: items,
          p_delta_items: delta.length > 0 ? delta : null,
        } as any);
        if (rpcError) throw rpcError;
      } else {
        // Count today's balcão orders for senha
        let newSenha = senha || "";
        if (tableName === "BALCÃO" && !existingOrderId) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const { count } = await supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("table_name", "BALCÃO")
            .gte("created_at", today.toISOString());
          newSenha = `#${((count || 0) + 1).toString().padStart(3, "0")}`;
        }

        // Create new order
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .insert({ table_name: tableName, waiter_name: waiterName, total, status: "new" })
          .select()
          .single();

        if (orderError || !order) throw orderError;

        const items = cart.map((item) => ({
          order_id: order.id,
          product_id: item.product.id,
          product_name: item.product.name,
          product_price: item.product.price,
          quantity: item.quantity,
          note: item.note || null,
          subtotal: item.product.price * item.quantity,
        }));

        const { error: itemsError } = await supabase.from("order_items").insert(items);
        if (itemsError) throw itemsError;

        playFeedback("success");
        onSuccess(newSenha);
        return;
      }

      playFeedback("success");
      onSuccess(senha || "");
    } catch (err) {
      console.error(err);
      playFeedback("error");
      toast({
        title: "Erro ao enviar pedido",
        description: "Tente novamente.",
        variant: "destructive",
      });
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col pb-32">
      <div className="sticky top-0 z-10 bg-background border-b border-border p-3">
        <button 
          onClick={() => {
            playFeedback("click");
            onBack();
          }} 
          className="flex items-center gap-2 text-muted-foreground text-base"
        >
          <ArrowLeft size={20} /> Voltar ao cardápio
        </button>
        <h2 className="mt-2 text-xl font-bold">
          {tableName === "BALCÃO" ? `BALCÃO ${senha || "Novo"}` : `Mesa: ${tableName}`}
        </h2>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {cart.map((item) => (
          <div key={item.product.id} className="rounded-lg bg-card border border-border p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-base">{item.product.name}</p>
                <p className="text-sm text-primary font-bold">
                  R$ {(item.product.price * item.quantity).toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    playFeedback("click");
                    onUpdateQuantity(item.product.id, -1);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-90 transition-transform"
                >
                  <Minus size={18} />
                </button>
                <span className="text-lg font-bold w-6 text-center">{item.quantity}</span>
                <button
                  onClick={() => {
                    playFeedback("click");
                    onUpdateQuantity(item.product.id, 1);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-90 transition-transform"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            <input
              type="text"
              placeholder="Observação (ex: sem cebola)"
              value={item.note}
              onChange={(e) => onUpdateNote(item.product.id, e.target.value)}
              className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />

            <button
              onClick={() => {
                playFeedback("heavy");
                onRemove(item.product.id);
              }}
              className="mt-2 flex items-center gap-1 text-sm text-destructive font-semibold"
            >
              <Trash2 size={14} /> REMOVER
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-lg font-bold">Total:</span>
          <span className="text-xl font-bold text-primary">R$ {total.toFixed(2)}</span>
        </div>

        {/* Botões de impressão manual — só para mesa existente */}
        {existingOrderId && (
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={async () => {
                playFeedback("click");
                const delta = calculateDelta(originalCart, cart);
                if (delta.length === 0) {
                  toast({ title: "Sem acréscimos", description: "Nenhum item novo para imprimir.", variant: "destructive" });
                  return;
                }
                await printDelta(tableName, waiterName, delta);
                toast({ title: "Acréscimo enviado para impressão" });
              }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary p-3 text-sm font-semibold text-foreground active:scale-95 transition-transform min-h-[44px]"
            >
              <Plus size={16} /> Acréscimo
            </button>
            <button
              type="button"
              onClick={async () => {
                playFeedback("click");
                await printReceipt(tableName, waiterName, cart.map(i => ({
                  product_name: i.product.name,
                  quantity: i.quantity,
                  product_price: i.product.price,
                  note: i.note || null,
                })), total);
                toast({ title: "Pedido enviado para impressão" });
              }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary p-3 text-sm font-semibold text-foreground active:scale-95 transition-transform min-h-[44px]"
            >
              <FileText size={16} /> Pedido
            </button>
            <button
              type="button"
              onClick={async () => {
                playFeedback("click");
                await printBill(tableName, waiterName, cart.map(i => ({
                  product_name: i.product.name,
                  quantity: i.quantity,
                  product_price: i.product.price,
                  note: i.note || null,
                })), total);
                toast({ title: "Conta enviada para impressão" });
              }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary p-3 text-sm font-semibold text-foreground active:scale-95 transition-transform min-h-[44px]"
            >
              <Receipt size={16} /> Conta
            </button>
          </div>
        )}

        <button
          onClick={handleFinalize}
          disabled={sending || cart.length === 0}
          className="w-full rounded-lg bg-success p-4 text-lg font-bold text-success-foreground transition-all duration-150 active:scale-[0.97] disabled:opacity-40 min-h-[56px]"
        >
          {sending ? "ENVIANDO..." : existingOrderId ? "✅ ATUALIZAR PEDIDO" : "✅ FINALIZAR PEDIDO"}
        </button>
      </div>
    </div>
  );
};

export default OrderReview;
