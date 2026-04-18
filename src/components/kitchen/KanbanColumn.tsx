import { Order, OrderItem } from "@/lib/types";
import KanbanCard from "./KanbanCard";

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
    <div className={`border-b md:border-b-0 md:border-r border-border md:last:border-r-0 flex flex-col md:h-full md:min-h-0 ${bgClass ?? ""}`}>
      {/* Cabeçalho */}
      <div className={`md:sticky md:top-0 z-10 p-3 border-b-2 ${borderClass} bg-card/95 backdrop-blur`}>
        <h2 className={`text-lg font-black uppercase tracking-wide ${colorClass}`}>
          {title} <span className="text-muted-foreground font-bold">({orders.length})</span>
        </h2>
      </div>

      {/* Lista — rola só no desktop; no mobile expande naturalmente */}
      <div className="md:flex-1 md:overflow-y-auto p-3 space-y-3">
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

export default KanbanColumn;
