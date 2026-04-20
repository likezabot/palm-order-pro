import { FileText, Receipt, FilePlus } from "lucide-react";
import { useFeedback } from "@/hooks/use-feedback";

export type PrintType = "extra" | "full" | "bill";

const PRINT_OPTIONS: { key: PrintType; label: string; icon: typeof FilePlus; desc: string }[] = [
  { key: "extra", label: "Acréscimo", icon: FilePlus, desc: "Só itens novos" },
  { key: "full", label: "Pedido", icon: FileText, desc: "Comanda completa" },
  { key: "bill", label: "Conta", icon: Receipt, desc: "Conta final" },
];

interface Props {
  value: PrintType;
  onChange: (type: PrintType) => void;
}

const PrintTypeSelector = ({ value, onChange }: Props) => {
  const { playFeedback } = useFeedback();

  return (
    <div className="mb-3">
      <p className="text-xs text-muted-foreground font-semibold mb-2 uppercase tracking-wide">
        Na central imprimir:
      </p>
      <div className="flex gap-2">
        {PRINT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                playFeedback("click");
                onChange(opt.key);
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
  );
};

export default PrintTypeSelector;
