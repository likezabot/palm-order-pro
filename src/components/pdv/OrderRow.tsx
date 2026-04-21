import { Clock, CheckCircle2, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useElapsedTime } from "@/hooks/use-elapsed-time";
import { formatTableLabel } from "@/lib/utils";
import type { Order } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  new: "NOVO",
  preparing: "EM PREPARO",
  done: "PRONTO",
};

const STATUS_CHIP: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  preparing: "bg-warning/15 text-warning border-warning/30",
  done: "bg-success/15 text-success border-success/30",
};

interface OrderRowProps {
  order: Order;
  itemCount: number;
  selected: boolean;
  onSelect: () => void;
  /** Optional: if not provided, computed from urgency state */
  accentBorder?: string;
}

export const OrderRow = ({ order, itemCount, selected, onSelect, accentBorder }: OrderRowProps) => {
  const elapsed = useElapsedTime(order.created_at);
  const time = new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const wasPrinted = order.print_status === "printed";
  const printFailed = order.print_status === "failed";

  const ageMin = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
  const isUrgent = ageMin >= 40;
  const isLate = !isUrgent && ageMin >= 20;
  const waitingPay = order.status === "done" && ageMin >= 10;

  const computedBorder =
    accentBorder ??
    (isUrgent
      ? "border-l-destructive"
      : isLate || waitingPay
        ? "border-l-warning"
        : "border-l-border");

  return (
    <button
      onClick={onSelect}
      className={`w-full flex flex-col gap-2 p-3 rounded-lg border-l-4 border ${computedBorder} transition-all text-left ${
        selected
          ? "border-primary bg-primary/10"
          : isUrgent
            ? "border-destructive bg-destructive/5 animate-pulse-active"
            : "border-border bg-card hover:border-muted-foreground/30"
      }`}
      style={isUrgent ? ({ ["--pulse-color" as any]: "hsl(var(--destructive) / 0.35)" } as React.CSSProperties) : undefined}
    >
      {/* Top: Table name + FEITO chip */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="font-black text-2xl flex items-center gap-2 leading-tight min-w-0 flex-1 break-words">
          {formatTableLabel(order.table_name, order.original_table_name)}
          {order.original_table_name && order.table_name !== order.original_table_name && order.table_name !== "BALCÃO" && (
            <span className="text-xs font-bold text-muted-foreground">(Mesa {order.original_table_name})</span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {wasPrinted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success border border-success/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
              <CheckCircle2 className="w-3 h-3" /> FEITO
            </span>
          )}
          {printFailed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive border border-destructive/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
              ⚠ FALHA
            </span>
          )}
        </div>
      </div>

      {/* Middle: items · waiter + elapsed chip */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="text-sm text-muted-foreground truncate min-w-0">
          {itemCount} {itemCount === 1 ? "item" : "itens"} · {order.waiter_name || "—"}
        </div>
        <div className="flex items-center gap-1 shrink-0 px-2 py-0.5 rounded bg-muted/40">
          <Clock size={12} className="text-muted-foreground" />
          <span className="text-xs font-black text-foreground leading-none">{elapsed || "agora"}</span>
          <span className="text-[10px] text-muted-foreground ml-1">{time}</span>
        </div>
      </div>

      {/* Bottom: total + urgency badges */}
      <div className="flex items-end justify-between gap-2 mt-1">
        <div className="flex flex-wrap gap-1.5 min-w-0">
          {isUrgent && (
            <Badge className="bg-destructive text-destructive-foreground text-xs gap-1">
              <Flame className="w-3 h-3" /> URGENTE
            </Badge>
          )}
          {isLate && (
            <Badge className="bg-warning text-warning-foreground text-xs">⚠ ATRASADO</Badge>
          )}
          {waitingPay && !isUrgent && !isLate && (
            <Badge className="bg-warning text-warning-foreground text-xs">AGUARDANDO PAG.</Badge>
          )}
        </div>
        <span className="font-black text-xl text-primary shrink-0">R$ {(order.total || 0).toFixed(2)}</span>
      </div>
    </button>
  );
};
