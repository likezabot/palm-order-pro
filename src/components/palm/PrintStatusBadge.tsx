import { Printer, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type PrintStatus = "idle" | "printing" | "success" | "error";

interface Props {
  status: PrintStatus;
  labelPrinting?: string;
  labelSuccess?: string;
  labelError?: string;
  labelIdle?: string;
  className?: string;
  onRetry?: () => void;
}

const PrintStatusBadge = ({
  status,
  labelPrinting = "Imprimindo senha...",
  labelSuccess = "Senha impressa ✓",
  labelError = "Falha na impressão",
  labelIdle,
  className,
  onRetry,
}: Props) => {
  if (status === "idle" && !labelIdle) return null;

  const base =
    "inline-flex flex-col items-stretch gap-2 rounded-xl px-4 py-3 text-sm font-bold min-w-[220px] max-w-[280px] mx-auto";

  if (status === "idle") {
    return (
      <div className={cn(base, "bg-white/10 text-white/70", className)}>
        <span className="text-center">{labelIdle}</span>
      </div>
    );
  }

  if (status === "printing") {
    return (
      <div className={cn(base, "bg-white/15 text-white animate-fade-in", className)}>
        <div className="flex items-center justify-center gap-2">
          <Printer size={18} className="animate-print-bounce" />
          <span>{labelPrinting}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-1/3 rounded-full bg-white animate-print-feed" />
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div
        className={cn(
          base,
          "bg-white/20 text-white animate-fade-in flex-row items-center justify-center",
          className,
        )}
      >
        <CheckCircle2 size={20} className="text-white" />
        <span>{labelSuccess}</span>
      </div>
    );
  }

  // error
  return (
    <div className={cn(base, "bg-destructive/30 text-white animate-fade-in", className)}>
      <div className="flex items-center justify-center gap-2">
        <AlertTriangle size={18} />
        <span>{labelError}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold uppercase active:scale-95 transition-transform"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
};

export default PrintStatusBadge;
