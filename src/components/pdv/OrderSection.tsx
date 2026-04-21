// DEPRECATED: o PDV agora usa um grid único de OrderRow. Mantido para compatibilidade.
import type { Order } from "@/lib/types";
import { OrderRow } from "./OrderRow";

export type Accent = "success" | "warning" | "destructive";

const accentClasses: Record<Accent, { dot: string; header: string; border: string }> = {
  success:     { dot: "bg-success",     header: "text-success",     border: "border-l-success" },
  warning:     { dot: "bg-warning",     header: "text-warning",     border: "border-l-warning" },
  destructive: { dot: "bg-destructive", header: "text-destructive", border: "border-l-destructive" },
};

interface OrderSectionProps {
  title: string;
  accent: Accent;
  orders: Order[];
  itemsByOrderId: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const OrderSection = ({ title, accent, orders, itemsByOrderId, selectedId, onSelect }: OrderSectionProps) => {
  const a = accentClasses[accent];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${a.dot}`} />
        <h3 className={`text-base font-black uppercase tracking-wide ${a.header}`}>
          {title} <span className="text-muted-foreground font-bold">({orders.length})</span>
        </h3>
      </div>
      {orders.length === 0 ? (
        <div className="text-sm text-muted-foreground px-3 py-2 italic">Nenhum pedido</div>
      ) : (
        orders.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            itemCount={itemsByOrderId.get(order.id) || 0}
            selected={selectedId === order.id}
            onSelect={() => onSelect(order.id)}
          />
        ))
      )}
    </div>
  );
};
