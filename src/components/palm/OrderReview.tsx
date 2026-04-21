import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Printer, Send, User, RotateCw, CheckCircle2, AlertTriangle } from "lucide-react";
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

type SendState = "idle" | "sending" | "success" | "error";
const SEND_TIMEOUT_MS = 20000;

const OrderReview = ({
  tableName, originalTableName, waiterName, cart, originalCart = [], total, existingOrderId, orderVersion, senha, onBack,
  onUpdateQuantity, onUpdateNote, onRemove, onSuccess, onCloseAccount, onRedirectToExisting,
  customerName, onCustomerNameChange,
}: Props) => {
  const isBalcao = tableName === "BALCÃO";
  const [sendState, setSendState] = useState<SendState>("idle");
  const [printType, setPrintType] = useState<PrintType>("extra");
  const [showConfirm, setShowConfirm] = useState(false);
  const [conflict, setConflict] = useState<{ orderId: string; tableName: string } | null>(null);
  const [reprintStatus, setReprintStatus] = useState<"idle" | "printing" | "success" | "error">("idle");
  const { toast } = useToast();
  const { playFeedback } = useFeedback();

  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const reprintingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSet = (s: SendState) => {
    if (mountedRef.current) setSendState(s);
  };

  const showWaiterTag = useMemo(() => {
    const uniqueWaiters = new Set(cart.map((i) => i.waiter_name || waiterName).filter(Boolean));
    return uniqueWaiters.size > 1;
  }, [cart, waiterName]);

  const isSending = sendState === "sending";

  const handleFinalize = async (shouldPrint: boolean) => {
    // Lock síncrono — imune a stale state de useState
    if (sendingRef.current || cart.length === 0) return;
    sendingRef.current = true;
    safeSet("sending");
    setShowConfirm(false);

    const myReq = ++requestIdRef.current;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      if (sendingRef.current && requestIdRef.current === myReq) {
        timedOut = true;
        sendingRef.current = false;
        safeSet("error");
        playFeedback("error");
      }
    }, SEND_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeoutId);
      sendingRef.current = false;
      if (mountedRef.current && sendState !== "success") {
        // Garante UI usável após erro/conflito
        if (!timedOut) safeSet("idle");
      }
    };

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

        const { data: rpcResult, error: rpcError } = await supabase.rpc("update_order_items", payload as any);

        // Descarta resposta tardia (request mais nova já foi disparada ou timeout)
        if (myReq !== requestIdRef.current || timedOut) return;

        if (rpcError) {
          const msg = rpcError.message || "";
          if (msg.includes("version_conflict")) {
            toast({ title: "Mesa alterada por outro aparelho", description: "Recarregue a mesa e tente de novo.", variant: "destructive" });
            return;
          }
          if (msg.includes("order_not_editable")) {
            toast({ title: "Pedido já fechado", description: "Esse pedido não pode mais ser editado.", variant: "destructive" });
            return;
          }
          throw rpcError;
        }

        playFeedback("success");
        safeSet("success");
        onSuccess("");
        return;
      }

      // CREATE flow
      let newSenha = senha || "";
      if (tableName === "BALCÃO") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("table_name", "BALCÃO")
          .gte("created_at", today.toISOString());
        if (myReq !== requestIdRef.current || timedOut) return;
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

      const { data: createData, error: createError } = await supabase.rpc("create_order", payload as any);

      if (myReq !== requestIdRef.current || timedOut) return;

      if (createError) {
        const msg = createError.message || "";
        const match = msg.match(/table_already_in_use:([0-9a-f-]+):(.+)$/i);
        if (match) {
          playFeedback("error");
          setConflict({ orderId: match[1], tableName: match[2].trim() });
          return;
        }
        throw createError;
      }

      playFeedback("success");
      const newOrderId =
        createData && typeof createData === "object" && !Array.isArray(createData)
          ? (createData as any).id
          : undefined;
      safeSet("success");
      onSuccess(newSenha, newOrderId, customerName?.trim() || undefined);
    } catch (err: any) {
      if (myReq !== requestIdRef.current || timedOut) return;
      console.error("[OrderReview] Erro completo:", err);
      playFeedback("error");
      const desc = [err?.message, err?.details, err?.hint].filter(Boolean).join(" — ") || "Tente novamente.";
      toast({
        title: "Erro ao enviar pedido",
        description: desc,
        variant: "destructive",
      });
    } finally {
      cleanup();
    }
  };

  const handleReprint = async () => {
    if (reprintingRef.current || !existingOrderId) return;
    reprintingRef.current = true;
    if (mountedRef.current) setReprintStatus("printing");
    try {
      playFeedback("click");
      const r = await reprintSenhaForOrder(existingOrderId);
      if (!mountedRef.current) return;
      if (r.ok) {
        setReprintStatus("success");
      } else {
        setReprintStatus("error");
      }
      // volta ao idle após 2.5s
      setTimeout(() => {
        if (mountedRef.current) setReprintStatus("idle");
      }, 2500);
    } finally {
      reprintingRef.current = false;
    }
  };

  return (
    <div className="flex h-screen-safe flex-col overflow-hidden">
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
          {isBalcao && existingOrderId && (() => {
            const isReprinting = reprintStatus === "printing";
            const colorCls =
              reprintStatus === "success"
                ? "bg-success text-success-foreground"
                : reprintStatus === "error"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-secondary text-secondary-foreground";
            const Icon =
              reprintStatus === "success"
                ? CheckCircle2
                : reprintStatus === "error"
                  ? AlertTriangle
                  : RotateCw;
            const label =
              reprintStatus === "printing"
                ? "Reimprimindo..."
                : reprintStatus === "success"
                  ? "Impresso ✓"
                  : reprintStatus === "error"
                    ? "Falhou"
                    : "Reimprimir senha";
            return (
              <button
                onClick={handleReprint}
                disabled={isReprinting}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold active:scale-95 transition-all disabled:pointer-events-none ${colorCls}`}
              >
                <Icon
                  size={16}
                  className={isReprinting ? "animate-spin" : reprintStatus !== "idle" ? "animate-fade-in" : ""}
                />
                {label}
              </button>
            );
          })()}
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
        sending={isSending}
        cartEmpty={cart.length === 0}
        existingOrderId={existingOrderId}
        printType={printType}
        onPrintTypeChange={setPrintType}
        onCloseAccount={onCloseAccount}
        onFinalize={() => {
          if (sendingRef.current) return;
          setShowConfirm(true);
        }}
      />

      <AlertDialog
        open={showConfirm}
        onOpenChange={(open) => {
          // Não deixa o Radix fechar/abrir enquanto envia
          if (sendingRef.current) return;
          setShowConfirm(open);
        }}
      >
        <AlertDialogContent className="max-w-[90vw] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Deseja imprimir?</AlertDialogTitle>
            <AlertDialogDescription>
              Escolha se deseja enviar o pedido com ou sem impressão na central.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
            <button
              type="button"
              disabled={isSending}
              onClick={() => handleFinalize(true)}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary p-4 text-lg font-bold text-primary-foreground active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              <Printer size={20} /> Enviar e imprimir
            </button>
            <button
              type="button"
              disabled={isSending}
              onClick={() => handleFinalize(false)}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-secondary p-4 text-lg font-bold text-secondary-foreground active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              <Send size={20} /> Enviar sem imprimir
            </button>
            <AlertDialogCancel
              disabled={isSending}
              className="w-full rounded-xl p-4 h-auto text-base border-none text-muted-foreground disabled:opacity-40 disabled:pointer-events-none"
            >
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
