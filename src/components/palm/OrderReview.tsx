import { useState } from "react";
import { ArrowLeft, Minus, Plus, Trash2, FileText, Receipt, FilePlus, Printer, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CartItem } from "@/lib/types";
import { calculateDelta } from "@/lib/order-delta";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PrintType = "extra" | "full" | "bill";

interface Props {
  tableName: string;
  originalTableName?: string;
  waiterName: string;
  cart: CartItem[];
  originalCart?: CartItem[];
  total: number;
  existingOrderId?: string | null;
  orderVersion?: number | null;
  senha?: string;
  onBack: () => void;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onUpdateNote: (productId: string, note: string) => void;
  onRemove: (productId: string) => void;
  onSuccess: (senha: string) => void;
  onCloseAccount?: () => void;
  onRedirectToExisting?: (tableName: string, orderId: string) => void;
}

const PRINT_OPTIONS: { key: PrintType; label: string; icon: typeof FilePlus; desc: string }[] = [
  { key: "extra", label: "Acréscimo", icon: FilePlus, desc: "Só itens novos" },
  { key: "full", label: "Pedido", icon: FileText, desc: "Comanda completa" },
  { key: "bill", label: "Conta", icon: Receipt, desc: "Conta final" },
];

const OrderReview = ({
  tableName, originalTableName, waiterName, cart, originalCart = [], total, existingOrderId, orderVersion, senha, onBack,
  onUpdateQuantity, onUpdateNote, onRemove, onSuccess, onCloseAccount, onRedirectToExisting,
}: Props) => {
  const [sending, setSending] = useState(false);
  const [printType, setPrintType] = useState<PrintType>("extra");
  const [showConfirm, setShowConfirm] = useState(false);
  const [conflict, setConflict] = useState<{ orderId: string; tableName: string } | null>(null);
  const { toast } = useToast();
  const { playFeedback } = useFeedback();

  const handleFinalize = async (shouldPrint: boolean) => {
    if (sending || cart.length === 0) return;
    setSending(true);
    setShowConfirm(false);

    try {
      if (existingOrderId) {
        const delta = calculateDelta(originalCart, cart);
        const items = cart.map((item) => ({
          product_id: item.product.id.length === 36 ? item.product.id : null,
          product_name: item.product.name,
          product_price: item.product.price,
          quantity: item.quantity,
          note: item.note || null,
          subtotal: item.product.price * item.quantity,
        }));

        const payload = {
          p_order_id: existingOrderId,
          p_total: total,
          p_items: items,
          p_delta_items: delta.length > 0 ? delta : null,
          p_print_type: printType,
          p_expected_version: orderVersion ?? undefined,
          p_should_print: shouldPrint,
        };
        console.log("[OrderReview] UPDATE payload:", JSON.stringify(payload, null, 2));
        
        const { data: rpcResult, error: rpcError } = await supabase.rpc("update_order_items", payload as any);
        console.log("[OrderReview] UPDATE result:", rpcResult, "error:", rpcError);

        if (rpcError) {
          const msg = rpcError.message || "";
          if (msg.includes("version_conflict")) {
            toast({ title: "Mesa alterada por outro aparelho", description: "Recarregue a mesa e tente de novo.", variant: "destructive" });
            setSending(false);
            return;
          }
          if (msg.includes("order_not_editable")) {
            toast({ title: "Pedido já fechado", description: "Esse pedido não pode mais ser editado.", variant: "destructive" });
            setSending(false);
            return;
          }
          throw rpcError;
        }
      } else {
        let newSenha = senha || "";
        if (tableName === "BALCÃO") {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const { count } = await supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("table_name", "BALCÃO")
            .gte("created_at", today.toISOString());
          newSenha = `#${((count || 0) + 1).toString().padStart(3, "0")}`;
        }

        const rpcItems = cart.map((item) => ({
          product_id: item.product.id.length === 36 ? item.product.id : null,
          product_name: item.product.name,
          product_price: item.product.price,
          quantity: item.quantity,
          note: item.note || null,
          subtotal: item.product.price * item.quantity,
        }));

        const payload = {
          p_table_name: tableName,
          p_waiter_name: waiterName,
          p_total: total,
          p_items: rpcItems,
          p_should_print: shouldPrint,
        };
        console.log("[OrderReview] CREATE payload:", JSON.stringify(payload, null, 2));

        const { data: createData, error: createError } = await supabase.rpc("create_order", payload as any);
        console.log("[OrderReview] CREATE result:", createData, "error:", createError);
        if (createError) {
          const msg = createError.message || "";
          // Formato: "table_already_in_use:<orderId>:<currentName>"
          const match = msg.match(/table_already_in_use:([0-9a-f-]+):(.+)$/i);
          if (match) {
            playFeedback("error");
            setConflict({ orderId: match[1], tableName: match[2].trim() });
            setSending(false);
            return;
          }
          throw createError;
        }

        playFeedback("success");
        onSuccess(newSenha);
        return;
      }

      playFeedback("success");
      onSuccess("");
    } catch (err: any) {
      console.error("[OrderReview] Erro completo:", err);
      playFeedback("error");
      const desc = [err?.message, err?.details, err?.hint].filter(Boolean).join(" — ") || "Tente novamente.";
      toast({
        title: "Erro ao enviar pedido",
        description: desc,
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

        {/* Seletor do que a central vai imprimir — só para mesa existente */}
        {existingOrderId && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground font-semibold mb-2 uppercase tracking-wide">
              Na central imprimir:
            </p>
            <div className="flex gap-2">
              {PRINT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = printType === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      playFeedback("click");
                      setPrintType(opt.key);
                    }}
                    className={`flex-1 flex flex-col items-center gap-1 rounded-lg border p-3 text-sm font-semibold transition-all active:scale-95 min-h-[56px] ${
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-secondary text-muted-foreground"
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-xs font-bold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {existingOrderId && onCloseAccount && (
          <button
            onClick={() => {
              playFeedback("click");
              onCloseAccount();
            }}
            className="w-full rounded-lg bg-primary p-4 text-lg font-bold text-primary-foreground transition-all duration-150 active:scale-[0.97] min-h-[56px] mb-2"
          >
            💰 FECHAR CONTA
          </button>
        )}

        <button
          onClick={() => {
            playFeedback("click");
            setShowConfirm(true);
          }}
          disabled={sending || cart.length === 0}
          className="w-full rounded-lg bg-success p-4 text-lg font-bold text-success-foreground transition-all duration-150 active:scale-[0.97] disabled:opacity-40 min-h-[56px]"
        >
          {sending ? "ENVIANDO..." : existingOrderId ? "✅ ATUALIZAR PEDIDO" : "✅ FINALIZAR PEDIDO"}
        </button>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="max-w-[90vw] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Deseja imprimir?</AlertDialogTitle>
            <AlertDialogDescription>
              Escolha se deseja enviar o pedido com ou sem impressão na central.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
            <button
              onClick={() => handleFinalize(true)}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary p-4 text-lg font-bold text-primary-foreground active:scale-[0.98] transition-all"
            >
              <Printer size={20} /> Enviar e imprimir
            </button>
            <button
              onClick={() => handleFinalize(false)}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-secondary p-4 text-lg font-bold text-secondary-foreground active:scale-[0.98] transition-all"
            >
              <Send size={20} /> Enviar sem imprimir
            </button>
            <AlertDialogCancel className="w-full rounded-xl p-4 h-auto text-base border-none text-muted-foreground">
              Cancelar
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!conflict} onOpenChange={(open) => !open && setConflict(null)}>
        <AlertDialogContent className="max-w-[90vw] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Mesa já está em uso</AlertDialogTitle>
            <AlertDialogDescription>
              Esta mesa já tem um pedido aberto como <strong>"{conflict?.tableName}"</strong>.
              Deseja abrir esse pedido em vez de criar outro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
            <button
              onClick={() => {
                if (conflict && onRedirectToExisting) {
                  onRedirectToExisting(conflict.tableName, conflict.orderId);
                }
                setConflict(null);
              }}
              className="w-full rounded-xl bg-primary p-4 text-lg font-bold text-primary-foreground active:scale-[0.98] transition-all"
            >
              Abrir pedido existente
            </button>
            <AlertDialogCancel
              onClick={() => setConflict(null)}
              className="w-full rounded-xl p-4 h-auto text-base border-none text-muted-foreground"
            >
              Cancelar
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OrderReview;
