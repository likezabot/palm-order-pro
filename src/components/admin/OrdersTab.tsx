import { Clock, Pencil, Printer, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Order } from "@/lib/types";

interface Props {
  orders: Order[];
  onPrint: (order: Order) => void;
  onEdit: (order: Order) => void;
}

export const OrdersTab = ({ orders, onPrint, onEdit }: Props) => (
  <div className="space-y-4">
    {/* Section header */}
    <div className="flex items-center gap-3">
      <div className="rounded-full bg-primary/10 p-2">
        <ShoppingBag className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Pedidos ativos
        </h2>
        <p className="text-xs text-muted-foreground">
          Pedidos em aberto, em preparo ou prontos
        </p>
      </div>
      <Badge variant="secondary" className="font-medium tabular-nums">
        {orders.length}
      </Badge>
    </div>

    {orders.length === 0 ? (
      <Card className="p-12 flex flex-col items-center justify-center text-center">
        <div className="rounded-full bg-muted p-4 mb-3">
          <ShoppingBag className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          Nenhum pedido ativo no momento
        </p>
      </Card>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {orders.map((order) => (
          <Card key={order.id} className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold tracking-tight text-foreground truncate">
                  Mesa {order.table_name}
                </h3>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span className="tabular-nums">
                    {new Date(order.created_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-border">·</span>
                  <span className="truncate">{order.waiter_name || "Garçom"}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Total
                </p>
                <p className="text-lg font-bold text-primary tabular-nums">
                  R$ {(order.total || 0).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-10 gap-2 font-medium"
                onClick={() => onPrint(order)}
              >
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
              <Button
                size="sm"
                className="h-10 gap-2 font-medium"
                onClick={() => onEdit(order)}
              >
                <Pencil className="w-4 h-4" /> Editar
              </Button>
            </div>
          </Card>
        ))}
      </div>
    )}
  </div>
);

export default OrdersTab;
