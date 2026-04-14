import { Order, OrderItem } from "@/lib/types";

interface Props {
  title: string;
  colorClass: string;
  borderClass: string;
  orders: Order[];
  getItems: (orderId: string) => OrderItem[];
  actionLabel?: string;
  actionColor?: string;
  onAction?: (orderId: string) => void;
}

const KanbanColumn = ({
  title, colorClass, borderClass, orders, getItems,
  actionLabel, actionColor, onAction,
}: Props) => {
  return (
    <div className={`border-r border-border last:border-r-0 flex flex-col`}>
      <div className={`p-3 border-b-2 ${borderClass} bg-card`}>
        <h2 className={`text-lg font-bold ${colorClass}`}>
          {title} ({orders.length})
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {orders.map((order) => {
          const items = getItems(order.id);
          const time = new Date(order.created_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <div
              key={order.id}
              className="rounded-lg bg-card border border-border p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-lg">{order.table_name}</span>
                <span className="text-sm text-muted-foreground">{time}</span>
              </div>

              <div className="space-y-1">
                {items.map((item) => (
                  <div key={item.id} className="text-sm text-foreground">
                    <span>• {item.quantity}x {item.product_name}</span>
                    {item.note && (
                      <span className="text-muted-foreground ml-2 italic">({item.note})</span>
                    )}
                  </div>
                ))}
              </div>

              {actionLabel && onAction && (
                <button
                  onClick={() => onAction(order.id)}
                  className={`w-full mt-2 rounded-lg p-3 font-bold text-base transition-all duration-150 active:scale-[0.97] ${actionColor}`}
                >
                  {actionLabel}
                </button>
              )}
            </div>
          );
        })}

        {orders.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhum pedido</p>
        )}
      </div>
    </div>
  );
};

export default KanbanColumn;
