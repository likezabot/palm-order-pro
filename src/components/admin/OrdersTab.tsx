import { Clock, Pencil, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Order } from "@/lib/types";

interface Props {
  orders: Order[];
  onPrint: (order: Order) => void;
  onEdit: (order: Order) => void;
}

export const OrdersTab = ({ orders, onPrint, onEdit }: Props) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
    {orders.length === 0 ? (
      <div className="col-span-full py-12 text-center text-muted-foreground bg-white rounded-xl border-2 border-dashed">
        Nenhum pedido ativo no momento
      </div>
    ) : (
      orders.map((order) => (
        <div
          key={order.id}
          className="bg-white border border-border rounded-xl p-4 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black">Mesa {order.table_name}</h3>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold">
                <Clock size={12} />
                {new Date(order.created_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
            <div className="text-right">
              <p className="text-primary font-black text-lg">
                R$ {(order.total || 0).toFixed(2)}
              </p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">
                {order.waiter_name || "Garçom"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="gap-2 font-bold h-12 border-2"
              onClick={() => onPrint(order)}
            >
              <Printer size={18} /> IMPRIMIR
            </Button>
            <Button
              variant="default"
              className="gap-2 font-bold h-12"
              onClick={() => onEdit(order)}
            >
              <Pencil size={18} /> EDITAR
            </Button>
          </div>
        </div>
      ))
    )}
  </div>
);

export default OrdersTab;
