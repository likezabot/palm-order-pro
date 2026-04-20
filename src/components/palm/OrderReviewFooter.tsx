import PrintTypeSelector, { PrintType } from "./PrintTypeSelector";
import { useFeedback } from "@/hooks/use-feedback";

interface Props {
  total: number;
  sending: boolean;
  cartEmpty: boolean;
  existingOrderId?: string | null;
  printType: PrintType;
  onPrintTypeChange: (type: PrintType) => void;
  onCloseAccount?: () => void;
  onFinalize: () => void;
}

const OrderReviewFooter = ({
  total,
  sending,
  cartEmpty,
  existingOrderId,
  printType,
  onPrintTypeChange,
  onCloseAccount,
  onFinalize,
}: Props) => {
  const { playFeedback } = useFeedback();

  return (
    <div className="shrink-0 bg-background border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-lg font-bold">Total:</span>
        <span className="text-xl font-bold text-primary">R$ {total.toFixed(2)}</span>
      </div>

      {existingOrderId && (
        <PrintTypeSelector value={printType} onChange={onPrintTypeChange} />
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
          onFinalize();
        }}
        disabled={sending || cartEmpty}
        className="w-full rounded-lg bg-success p-4 text-lg font-bold text-success-foreground transition-all duration-150 active:scale-[0.97] disabled:opacity-40 min-h-[56px]"
      >
        {sending ? "ENVIANDO..." : existingOrderId ? "✅ ATUALIZAR PEDIDO" : "✅ FINALIZAR PEDIDO"}
      </button>
    </div>
  );
};

export default OrderReviewFooter;
