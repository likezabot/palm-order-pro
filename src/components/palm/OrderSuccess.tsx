import { useEffect } from "react";
import { CheckCircle } from "lucide-react";

interface Props {
  onReset: () => void;
}

const OrderSuccess = ({ onReset }: Props) => {
  useEffect(() => {
    const timer = setTimeout(onReset, 2000);
    return () => clearTimeout(timer);
  }, [onReset]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-success p-6 text-center">
      <div className="rounded-full bg-white/20 p-6 animate-pulse-success">
        <CheckCircle size={100} className="text-white" />
      </div>
      <div className="space-y-2">
        <h1 className="text-4xl font-black text-white tracking-tighter">PEDIDO ENVIADO! ✅</h1>
        <p className="text-success-foreground font-bold text-lg opacity-80">
          Tudo certo! Voltando ao início...
        </p>
      </div>
    </div>
  );
};

export default OrderSuccess;
