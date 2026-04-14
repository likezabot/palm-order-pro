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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-success/10">
      <CheckCircle size={80} className="text-success animate-pulse-success" />
      <h1 className="text-3xl font-bold text-success">PEDIDO ENVIADO!</h1>
      <p className="text-muted-foreground">Voltando em instantes...</p>
    </div>
  );
};

export default OrderSuccess;
