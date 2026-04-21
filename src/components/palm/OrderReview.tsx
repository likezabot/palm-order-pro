import { useMemo, useState } from "react";
import { ArrowLeft, Printer, Send, User, RotateCw } from "lucide-react";
import { reprintSenhaForOrder } from "@/lib/reprint-senha";
import { supabase } from "@/integrations/supabase/client";
import { CartItem } from "@/lib/types";
import { calculateDelta } from "@/lib/order-delta";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import CartItemRow from "./CartItemRow";
import OrderReviewFooter from "./OrderReviewFooter";
import { PrintType } from "./PrintTypeSelector";

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
  onSuccess: (senha: string, orderId?: string, customerName?: string) => void;
  onCloseAccount?: () => void;
  onRedirectToExisting?: (tableName: string, orderId: string) => void;
  customerName?: string;
  onCustomerNameChange?: (name: string) => void;
}

const OrderReview = ({
  tableName, originalTableName, waiterName, cart, originalCart = [], total, existingOrderId, orderVersion, senha, onBack,
  onUpdateQuantity, onUpdateNote, onRemove, onSuccess, onCloseAccount, onRedirectToExisting,
  customerName, onCustomerNameChange,
}: Props) => {
  const isBalcao = tableName === "BALCÃO";
  const [sending, setSending] = useState(false);
  const [printType, setPrintType] = useState<PrintType>("extra");
  const [showConfirm, setShowConfirm] = useState(false);
  const [conflict, setConflict] = useState<{ orderId: string; tableName: string } | null>(null);
  const { toast } = useToast();
  const { playFeedback } = useFeedback();

  const showWaiterTag = useMemo(() => {
    const uniqueWaiters = new Set(cart.map((i) => i.waiter_name || waiterName).filter(Boolean));
    return uniqueWaiters.size > 1;
  }, [cart, waiterName]);

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
          waiter_name: item.waiter_name || waiterName || null,
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
          waiter_name: item.waiter_name || waiterName || null,
        }));

        const payload = {
          p_table_name: tableName,
          p_waiter_name: waiterName,
          p_total: total,
          p_items: rpcItems,
          p_should_print: shouldPrint,
          p_original_table_name: originalTableName || tableName,
        };
        console.log("[OrderReview] CREATE payload:", JSON.stringify(payload, null, 2));

        const { data: createData, error: createError } = await supabase.rpc("create_order", payload as any);
        console.log("[OrderReview] CREATE result:", createData, "error:", createError);
        if (createError) {
          const msg = createError.message || "";
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
        // RPC retorna { id, ... } — propaga o id para a tela de sucesso (cupom da senha).
        const newOrderId =
          createData && typeof createData === "object" && !Array.isArray(createData)
            ? (createData as any).id
            : undefined;
        onSuccess(newSenha, newOrderId, customerName?.trim() || undefined);
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
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <div className="shrink-0 bg-background border-b border-border p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button
          onClick={() => {
            playFeedback("click");
            onBack();
          }}
          className="flex items-center gap-2 text-muted-foreground text-base"
        >
          <ArrowLeft size={20} /> Voltar ao cardápio
        </button>
        <div className="mt-2 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">
            {isBalcao ? `BALCÃO ${senha || "Novo"}` : `Mesa: ${tableName}`}
          </h2>
          {isBalcao && existingOrderId && (
            <button
              onClick={async () => {
                playFeedback("click");
                const r = await reprintSenhaForOrder(existingOrderId);
                if (r.ok) {
                  toast({ title: "Senha reimpressa" });
                } else {
                  toast({
                    title: "Não foi possível reimprimir",
                    description: r.reason,
                    variant: "destructive",
                  });
                }
              }}
              className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground active:scale-95 transition-transform"
            >
              <RotateCw size={16} /> Reimprimir senha
            </button>
          )}
        </div>
        {isBalcao && !existingOrderId && onCustomerNameChange && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-secondary px-3 py-2">
            <User size={18} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={customerName || ""}
              onChange={(e) => onCustomerNameChange(e.target.value)}
              placeholder="Nome do cliente (opcional)"
              maxLength={40}
              className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-2 p-2">
        {cart.map((item) => (
          <CartItemRow
            key={`${item.product.id}-${(item.waiter_name || "").trim().toUpperCase()}`}
            item={item}
            showWaiterTag={showWaiterTag}
            fallbackWaiter={waiterName}
            onUpdateQuantity={onUpdateQuantity}
            onUpdateNote={onUpdateNote}
            onRemove={onRemove}
          />
        ))}
      </div>

      <OrderReviewFooter
        total={total}
        sending={sending}
        cartEmpty={cart.length === 0}
        existingOrderId={existingOrderId}
        printType={printType}
        onPrintTypeChange={setPrintType}
        onCloseAccount={onCloseAccount}
        onFinalize={() => setShowConfirm(true)}
      />

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
