import { Order, OrderItem } from "@/lib/types";
import { useElapsedTime } from "@/hooks/use-elapsed-time";
import { Clock, Flame } from "lucide-react";
import { summarizeItemWaiters, formatWaiterTag } from "@/lib/order-items-group";

interface CardProps {
  order: Order;
  items: OrderItem[];
  actionLabel?: string;
  actionColor?: string;
  onAction?: (orderId: string) => void;
  pulse?: boolean;
}

const statusBorder: Record<string, string> = {
  new: "border-l-primary",
  preparing: "border-l-warning",
  done: "border-l-success",
};

const KanbanCard = ({ order, items, actionLabel, actionColor, onAction, pulse }: CardProps) => {
  const elapsed = useElapsedTime(order.created_at);
  const time = new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const ageMin = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
  const isUrgent = ageMin >= 25;
  const isLate = !isUrgent && ageMin >= 12;

  const timeBadgeClass = isUrgent
    ? "bg-destructive text-destructive-foreground"
    : isLate
      ? "bg-warning text-warning-foreground"
      : "bg-muted text-muted-foreground";

  const summarized = summarizeItemWaiters(items, order.waiter_name || "");
  const sideBorder = statusBorder[order.status] ?? "border-l-border";

  return (
    <div
      className={`rounded-xl bg-card border border-border/70 border-l-[5px] ${sideBorder} p-4 space-y-2 transition-all shadow-card animate-fade-in-up ${
        isUrgent ? "ring-1 ring-destructive/40" : isLate ? "ring-1 ring-warning/30" : ""
      } ${pulse ? "animate-pulse-active" : ""}`}
      style={pulse ? ({ ["--pulse-color" as any]: "hsl(var(--primary) / 0.4)" } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-black text-xl leading-tight">
          {order.table_name === "BALCÃO"
            ? "BALCÃO"
            : order.original_table_name && order.table_name !== order.original_table_name
            ? `Mesa ${order.original_table_name} · ${order.table_name}`
            : `Mesa ${order.table_name}`}
        </span>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-black ${timeBadgeClass}`}>
          {isUrgent ? <Flame size={14} /> : <Clock size={14} />}
          <span>{elapsed || "agora"}</span>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">Entrou às {time}</div>

      <div className="space-y-1 pt-1">
        {summarized.map((item, idx) => {
          const tag = formatWaiterTag(item.waiters, order.waiter_name);
          return (
            <div key={`${item.product_id || item.product_name}-${idx}`} className="text-base text-foreground">
              <span className="font-semibold">• {item.quantity}x {item.product_name}</span>
              {item.note && (
                <span className="text-muted-foreground ml-2 italic text-sm">({item.note})</span>
              )}
              {tag && (
                <span className="ml-2 text-[10px] uppercase tracking-wide font-bold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded align-middle">
                  {tag}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction(order.id);
          }}
          className={`relative z-10 w-full mt-2 rounded-xl p-3 font-black text-base transition-all duration-150 min-h-[56px] touch-manipulation cursor-pointer active:scale-[0.97] shadow-soft ${actionColor}`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default KanbanCard;
