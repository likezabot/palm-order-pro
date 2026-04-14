import { useEffect, useCallback } from "react";
import { CheckCircle, Printer } from "lucide-react";
import { printSenha } from "@/lib/print-receipt";
import { CartItem } from "@/lib/types";

interface Props {
  onReset: () => void;
  senha?: string;
  cart?: CartItem[];
}

const OrderSuccess = ({ onReset, senha, cart }: Props) => {
  const handlePrint = useCallback(() => {
    if (!senha) return;
    const items = (cart || []).map((i) => ({
      product_name: i.product.name,
      quantity: i.quantity,
    }));
    printSenha(senha, items);
  }, [senha, cart]);

  useEffect(() => {
    // Auto-print senha for counter orders
    if (senha) handlePrint();
  }, []);

  useEffect(() => {
    const timer = setTimeout(onReset, 4000);
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
            <p className="text-6xl font-black text-white mt-4">{senha}</p>
            <button
              onClick={handlePrint}
              className="mt-4 flex items-center gap-2 mx-auto rounded-lg bg-white/20 px-6 py-3 text-white font-bold text-lg active:scale-95 transition-transform"
            >
              <Printer size={22} /> IMPRIMIR SENHA
            </button>
          </>
        )}
        <p className="text-success-foreground font-bold text-lg opacity-80">
          Tudo certo! Voltando ao início...
        </p>
      </div>
    </div>
  );
};

export default OrderSuccess;
