import { useEffect, useCallback, useRef } from "react";
import { CheckCircle, Printer } from "lucide-react";
import { printSenha } from "@/lib/print-receipt";
import { CartItem } from "@/lib/types";

interface Props {
  onReset: () => void;
  senha?: string;
  cart?: CartItem[];
}

const OrderSuccess = ({ onReset, senha, cart }: Props) => {
  const printedRef = useRef(false);

  const handlePrint = useCallback(() => {
    if (!senha) return;
    const items = (cart || []).map((i) => ({
      product_name: i.product.name,
      quantity: i.quantity,
    }));
    printSenha(senha, items);
  }, [senha, cart]);

  useEffect(() => {
    // Auto-print senha for counter orders only once
    if (senha && !printedRef.current) {
      printedRef.current = true;
      // Small delay to ensure the component is fully mounted and browser is ready
      const timer = setTimeout(() => {
        handlePrint();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [handlePrint, senha]);

  useEffect(() => {
    const delay = senha ? 5000 : 3000;
    const timer = setTimeout(onReset, delay);
    return () => clearTimeout(timer);
  }, [onReset]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-success p-6 text-center">
      <div className="rounded-full bg-white/20 p-6 animate-pulse-success">
        <CheckCircle size={100} className="text-white" />
      </div>
      <div className="space-y-2">
        <h1 className="text-4xl font-black text-white tracking-tighter">PEDIDO ENVIADO! ✅</h1>
        {senha && (
          <>
            <p className="text-xl font-bold text-white/80 uppercase">Sua Senha:</p>
            <p className="text-8xl font-black text-white mt-1">{senha}</p>
            <button
              onClick={handlePrint}
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
