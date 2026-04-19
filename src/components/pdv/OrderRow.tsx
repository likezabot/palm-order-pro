import { Clock, CheckCircle2, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useElapsedTime } from "@/hooks/use-elapsed-time";
import { formatTableLabel } from "@/lib/utils";
import type { Order } from "@/lib/types";

interface OrderRowProps {
  order: Order;
  itemCount: number;
  selected: boolean;
  onSelect: () => void;
  accentBorder: string;
}

export const OrderRow = ({ order, itemCount, selected, onSelect, accentBorder }: OrderRowProps) => {
  const elapsed = useElapsedTime(order.created_at);
  const time = new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const wasPrinted = order.print_status === "printed";

  const ageMin = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
  const isUrgent = ageMin >= 40;
  const isLate = !isUrgent && ageMin >= 20;
  const waitingPay = order.status === "done" && ageMin >= 10;

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center justify-between p-4 rounded-lg border-l-4 border ${accentBorder} transition-all text-left ${
        selected
          ? "border-primary bg-primary/10"
          : isUrgent
            ? "border-destructive bg-destructive/5 animate-pulse-active"
            : "border-border bg-card hover:border-muted-foreground/30"
      }`}
      style={isUrgent ? ({ ["--pulse-color" as any]: "hsl(var(--destructive) / 0.35)" } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col items-center justify-center min-w-[64px] px-2 py-1 rounded bg-muted/40">
          <Clock size={14} className="text-muted-foreground" />
          <span className="text-sm font-black text-foreground leading-none mt-1">{elapsed || "agora"}</span>
          <span className="text-[10px] text-muted-foreground mt-0.5">{time}</span>
        </div>
        <div className="min-w-0">
          <div className="font-black text-2xl flex items-center gap-2 leading-tight">
            {formatTableLabel(order.table_name, order.original_table_name)}
            {order.original_table_name && order.table_name !== order.original_table_name && order.table_name !== "BALCÃO" && (
              <span className="text-xs font-bold text-muted-foreground">(Mesa {order.original_table_name})</span>
            )}
            {wasPrinted && <CheckCircle2 className="w-4 h-4 text-success" />}
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {itemCount} {itemCount === 1 ? "item" : "itens"} · {order.waiter_name || "—"}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {isUrgent && (
              <Badge className="bg-destructive text-destructive-foreground text-xs gap-1">
                <Flame className="w-3 h-3" /> URGENTE
              </Badge>
            )}
            {isLate && (
              <Badge className="bg-warning text-warning-foreground text-xs">⚠ ATRASADO</Badge>
            )}
            {waitingPay && !isUrgent && !isLate && (
              <Badge className="bg-warning text-warning-foreground text-xs">AGUARDANDO PAGAMENTO</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="font-black text-xl text-primary">R$ {(order.total || 0).toFixed(2)}</span>
      </div>
    </button>
  );
};
