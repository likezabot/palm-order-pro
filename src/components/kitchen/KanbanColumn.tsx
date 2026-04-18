import { Order, OrderItem } from "@/lib/types";
import { useElapsedTime } from "@/hooks/use-elapsed-time";
import { Clock, Flame } from "lucide-react";

interface Props {
  title: string;
  colorClass: string;
  borderClass: string;
  bgClass?: string;
  orders: Order[];
  getItems: (orderId: string) => OrderItem[];
  actionLabel?: string;
  actionColor?: string;
  onAction?: (orderId: string) => void;
  pulseNew?: boolean;
}

const KanbanColumn = ({
  title, colorClass, borderClass, bgClass, orders, getItems,
  actionLabel, actionColor, onAction, pulseNew,
}: Props) => {
  return (
    <div className={`border-r border-border last:border-r-0 flex flex-col h-full min-h-0 ${bgClass ?? ""}`}>
      {/* Cabeçalho fixo */}
      <div className={`sticky top-0 z-10 p-3 border-b-2 ${borderClass} bg-card/95 backdrop-blur`}>
        <h2 className={`text-lg font-black uppercase tracking-wide ${colorClass}`}>
          {title} <span className="text-muted-foreground font-bold">({orders.length})</span>
        </h2>
      </div>

      {/* Lista com rolagem vertical */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {orders.map((order) => (
          <KanbanCard
            key={order.id}
            order={order}
            items={getItems(order.id)}
            actionLabel={actionLabel}
            actionColor={actionColor}
            onAction={onAction}
            pulse={pulseNew}
          />
        ))}

        {orders.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhum pedido</p>
        )}
      </div>
    </div>
  );
};

interface CardProps {
  order: Order;
  items: OrderItem[];
  actionLabel?: string;
  actionColor?: string;
  onAction?: (orderId: string) => void;
  pulse?: boolean;
}

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

  return (
    <div
      className={`rounded-lg bg-card border-2 p-4 space-y-2 transition-all ${
        isUrgent ? "border-destructive" : isLate ? "border-warning" : "border-border"
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
        <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-sm font-black ${timeBadgeClass}`}>
          {isUrgent ? <Flame size={14} /> : <Clock size={14} />}
          <span>{elapsed || "agora"}</span>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">Entrou às {time}</div>

      <div className="space-y-1 pt-1">
        {items.map((item) => (
          <div key={item.id} className="text-base text-foreground">
            <span className="font-semibold">• {item.quantity}x {item.product_name}</span>
            {item.note && (
              <span className="text-muted-foreground ml-2 italic text-sm">({item.note})</span>
            )}
          </div>
        ))}
      </div>

      {actionLabel && onAction && (
        <button
          onClick={() => onAction(order.id)}
          className={`w-full mt-2 rounded-lg p-3 font-black text-base transition-all duration-150 active:scale-[0.97] min-h-[56px] ${actionColor}`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default KanbanColumn;
