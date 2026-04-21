import { useEffect, useCallback, useRef, useState } from "react";
import { CheckCircle, Printer } from "lucide-react";
import { printSenha } from "@/lib/print-receipt";
import { loadPrintConfig } from "@/lib/print-config";
import { CartItem } from "@/lib/types";
import PrintStatusBadge, { PrintStatus } from "./PrintStatusBadge";

interface Props {
  onReset: () => void;
  senha?: string;
  cart?: CartItem[];
  allowLocalPrint?: boolean;
  waiterName?: string;
  orderId?: string;
  customerName?: string;
}

const PRINT_TIMEOUT_MS = 8000;

const OrderSuccess = ({
  onReset,
  senha,
  cart,
  allowLocalPrint = false,
  waiterName,
  orderId,
  customerName,
}: Props) => {
  const printedRef = useRef(false);
  const resetFiredRef = useRef(false);
  const mountedRef = useRef(true);
  const printingRef = useRef(false);

  // bridge mode resolved once on mount — avoids re-evaluating localStorage mid-flow
  const [bridgeMode] = useState(() => {
    try {
      return loadPrintConfig().printMode === "bridge";
    } catch {
      return false;
    }
  });

  const shouldShowBadge = allowLocalPrint && !!senha;
  const initialStatus: PrintStatus = shouldShowBadge && bridgeMode ? "printing" : "idle";
  const [status, setStatus] = useState<PrintStatus>(initialStatus);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const buildPrintArgs = useCallback(() => {
    const items = (cart || []).map((i) => ({
      product_name: i.product.name,
      quantity: i.quantity,
      product_price: i.product.price,
    }));
    const total = (cart || []).reduce(
      (s, i) => s + i.product.price * i.quantity,
      0,
    );
    return { items, total };
  }, [cart]);

  const runPrint = useCallback(
    async (force: boolean) => {
      if (!senha || printingRef.current) return;
      printingRef.current = true;
      if (mountedRef.current) setStatus("printing");

      const { items, total } = buildPrintArgs();
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        if (!printingRef.current) return;
        timedOut = true;
        printingRef.current = false;
        if (mountedRef.current) setStatus("error");
      }, PRINT_TIMEOUT_MS);

      try {
        const ok = await printSenha(senha, items, {
          waiterName,
          orderId,
          customerName,
          total,
          force,
        });
        if (timedOut) return;
        if (!mountedRef.current) return;
        setStatus(ok ? "success" : "error");
      } catch {
        if (timedOut || !mountedRef.current) return;
        setStatus("error");
      } finally {
        clearTimeout(timeoutId);
        printingRef.current = false;
      }
    },
    [senha, buildPrintArgs, waiterName, orderId, customerName],
  );

  // Auto-print uma única vez ao montar (se aplicável)
  useEffect(() => {
    if (!shouldShowBadge || !bridgeMode || printedRef.current) return;
    printedRef.current = true;
    const timer = setTimeout(() => {
      if (mountedRef.current) runPrint(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [shouldShowBadge, bridgeMode, runPrint]);

  // Auto-reset: para mesas, dispara imediatamente (próximo frame).
  // Para pedidos com badge (BALCÃO + impressão), aguarda impressão terminar ou fallback.
  useEffect(() => {
    if (resetFiredRef.current) return;

    // Pedido de mesa: pequeno delay (~800ms) para feedback visual antes de voltar à grade
    if (!shouldShowBadge) {
      const timer = setTimeout(() => {
        if (resetFiredRef.current) return;
        resetFiredRef.current = true;
        onReset();
      }, 800);
      return () => clearTimeout(timer);
    }

    let delay: number;
    if (!bridgeMode) {
      delay = 2500;
    } else if (status === "success" || status === "error") {
      delay = 1500;
    } else {
      // ainda imprimindo — fallback amplo (timeout interno do print = 8s)
      delay = 9000;
    }

    const timer = setTimeout(() => {
      if (resetFiredRef.current) return;
      resetFiredRef.current = true;
      onReset();
    }, delay);
    return () => clearTimeout(timer);
  }, [shouldShowBadge, bridgeMode, status, onReset]);

  const handleManualPrint = useCallback(() => {
    runPrint(true);
  }, [runPrint]);

  const isPrinting = status === "printing";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-hidden p-6 text-center min-h-[100dvh] bg-gradient-to-br from-success via-success to-emerald-700">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-white/30 animate-ping opacity-60" />
        <div className="relative rounded-full bg-white/20 p-6 animate-scale-in ring-4 ring-white/20">
          <CheckCircle size={100} className="text-white" />
        </div>
      </div>
      <div className="space-y-2 animate-fade-in-up">
        <h1 className="text-4xl font-black text-white tracking-tight drop-shadow-lg">PEDIDO ENVIADO!</h1>
        {shouldShowBadge && (
          <>
            <p className="text-xl font-bold text-white/85 uppercase tracking-widest">Sua Senha</p>
            <p className="text-7xl sm:text-8xl font-black text-white mt-1 drop-shadow-2xl tabular-nums">{senha}</p>

            <div className="pt-4">
              <PrintStatusBadge
                status={status}
                labelIdle={!bridgeMode ? "Impressão local desativada" : undefined}
                onRetry={status === "error" ? handleManualPrint : undefined}
              />
            </div>

            <button
              type="button"
              onClick={handleManualPrint}
              disabled={isPrinting}
              className="mt-6 inline-flex items-center gap-2 mx-auto rounded-lg bg-white px-8 py-4 text-success font-black text-xl active:scale-95 transition-transform shadow-xl disabled:opacity-50 disabled:pointer-events-none"
            >
              <Printer size={24} className={isPrinting ? "animate-print-bounce" : ""} />
              {isPrinting ? "IMPRIMINDO..." : "IMPRIMIR NOVAMENTE"}
            </button>
          </>
        )}
        <p className="text-success-foreground font-bold text-lg opacity-80 pt-8">
          Tudo certo! Retornando em alguns instantes...
        </p>
      </div>
    </div>
  );
};

export default OrderSuccess;
