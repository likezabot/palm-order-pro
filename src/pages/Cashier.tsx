import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Order, OrderItem } from "@/lib/types";
import CloseOrder from "@/components/cashier/CloseOrder";

const Cashier = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
        <h1 className="text-xl font-bold">CAIXA</h1>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {orders.length === 0 && (
          <p className="text-center text-muted-foreground py-12">Nenhuma mesa aberta</p>
        )}
        {orders.map((order) => (
          <div
            key={order.id}
            className="flex items-center justify-between rounded-lg bg-card border border-border p-4"
          >
            <div>
              <p className="font-bold text-lg">{order.table_name}</p>
              <p className="text-primary font-bold">R$ {(order.total || 0).toFixed(2)}</p>
            </div>
            <button
              onClick={() => setSelectedOrder(order)}
              className="rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground active:scale-95 transition-transform min-h-[48px]"
            >
              FECHAR
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Cashier;
