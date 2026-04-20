import { useEffect, useCallback, useRef } from "react";
import { CheckCircle, Printer } from "lucide-react";
import { printSenha } from "@/lib/print-receipt";
import { CartItem } from "@/lib/types";

interface Props {
  onReset: () => void;
  senha?: string;
  cart?: CartItem[];
  allowLocalPrint?: boolean;
  waiterName?: string;
  orderId?: string;
  customerName?: string;
}

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

  const handleAutoPrint = useCallback(() => {
    if (!allowLocalPrint || !senha) return;
    const { items, total } = buildPrintArgs();
    // Auto: respeita toggle (force=false)
    printSenha(senha, items, {
      waiterName,
      orderId,
      customerName,
      total,
      force: false,
    });
  }, [allowLocalPrint, senha, buildPrintArgs, waiterName, orderId, customerName]);

  const handleManualPrint = useCallback(() => {
    if (!senha) return;
    const { items, total } = buildPrintArgs();
    // Manual: ignora toggle (force=true)
    printSenha(senha, items, {
      waiterName,
      orderId,
      customerName,
      total,
      force: true,
    });
  }, [senha, buildPrintArgs, waiterName, orderId, customerName]);

  useEffect(() => {
    if (allowLocalPrint && senha && !printedRef.current) {
      printedRef.current = true;
      const timer = setTimeout(() => {
        handleAutoPrint();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [allowLocalPrint, handleAutoPrint, senha]);

  useEffect(() => {
    const delay = allowLocalPrint && senha ? 5000 : 3000;
    const timer = setTimeout(onReset, delay);
    return () => clearTimeout(timer);
  }, [allowLocalPrint, onReset, senha]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-success p-6 text-center">
      <div className="rounded-full bg-white/20 p-6 animate-pulse-success">
        <CheckCircle size={100} className="text-white" />
      </div>
      <div className="space-y-2">
        <h1 className="text-4xl font-black text-white tracking-tighter">PEDIDO ENVIADO! ✅</h1>
        {allowLocalPrint && senha && (
          <>
            <p className="text-xl font-bold text-white/80 uppercase">Sua Senha:</p>
            <p className="text-8xl font-black text-white mt-1">{senha}</p>
            <button
              onClick={handleManualPrint}
              className="mt-8 flex items-center gap-2 mx-auto rounded-lg bg-white px-8 py-4 text-success font-black text-xl active:scale-95 transition-transform shadow-xl"
            >
              <Printer size={24} /> IMPRIMIR NOVAMENTE
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
