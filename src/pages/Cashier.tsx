import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Printer, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Order, OrderItem } from "@/lib/types";
import CloseOrder from "@/components/cashier/CloseOrder";
import { manualPrintOrder } from "@/lib/print-service";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";

const Cashier = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playFeedback } = useFeedback();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ["cashier-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["new", "preparing", "done"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Order[];
    },
    refetchInterval: 5000,
  });

  const handlePrint = async (order: Order) => {
    playFeedback("click");
    const success = await manualPrintOrder(order);
    if (success) {
      toast({ title: `Cupom enviado para Mesa ${order.table_name}` });
    } else {
      toast({ title: "Erro ao imprimir", variant: "destructive" });
    }
  };

  const handleEdit = (order: Order) => {
    playFeedback("click");
    navigate(`/palm?orderId=${order.id}&tableName=${order.table_name}`);
  };

  if (selectedOrder) {
    return (
      <CloseOrder
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onClosed={() => {
          setSelectedOrder(null);
          queryClient.invalidateQueries({ queryKey: ["cashier-orders"] });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="border-b border-border p-4 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-muted-foreground">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold uppercase tracking-tight">CAIXA</h1>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {orders.length === 0 && (
          <p className="text-center text-muted-foreground py-12">Nenhuma mesa aberta</p>
        )}
        {orders.map((order) => (
          <div
            key={order.id}
            className="flex items-center justify-between rounded-xl bg-card border-2 border-border p-4 shadow-sm"
          >
            <div className="flex-1">
              <p className="font-black text-xl text-foreground">Mesa {order.table_name}</p>
              <p className="text-primary font-black text-lg">R$ {(order.total || 0).toFixed(2)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePrint(order)}
                className="p-3 rounded-lg bg-secondary text-foreground active:scale-95 transition-transform"
                title="Imprimir"
              >
                <Printer size={20} />
              </button>
              <button
                onClick={() => handleEdit(order)}
                className="p-3 rounded-lg bg-secondary text-foreground active:scale-95 transition-transform"
                title="Editar"
              >
                <Pencil size={20} />
              </button>
              <button
                onClick={() => {
                  playFeedback("click");
                  setSelectedOrder(order);
                }}
                className="rounded-lg bg-primary px-5 py-3 font-black text-primary-foreground active:scale-95 transition-transform min-h-[48px]"
              >
                FECHAR
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Cashier;
