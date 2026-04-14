import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Order, OrderItem } from "@/lib/types";
import KanbanColumn from "@/components/kitchen/KanbanColumn";
import { useFeedback } from "@/hooks/use-feedback";

const Kitchen = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { playFeedback } = useFeedback();
  const prevCountRef = useRef(0);

  const { data: orders = [] } = useQuery({
    queryKey: ["kitchen-orders"],
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

  const { data: allItems = [] } = useQuery({
    queryKey: ["kitchen-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_items").select("*");
      if (error) throw error;
      return data as OrderItem[];
    },
    refetchInterval: 5000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("kitchen-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["kitchen-items"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Beep on new orders
  const newOrders = orders.filter((o) => o.status === "new");
  useEffect(() => {
    if (newOrders.length > prevCountRef.current) {
      playFeedback("notification");
    }
    prevCountRef.current = newOrders.length;
  }, [newOrders.length, playFeedback]);

  const updateStatus = async (orderId: string, status: string) => {
    playFeedback("click");
    await supabase.from("orders").update({ status }).eq("id", orderId);
    queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
  };

  const getItems = (orderId: string) => allItems.filter((i) => i.order_id === orderId);

  const preparing = orders.filter((o) => o.status === "preparing");
  const done = orders.filter((o) => o.status === "done");

  return (
    <div className="min-h-screen flex flex-col">
      <div className="border-b border-border p-4 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-muted-foreground">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">PAINEL COZINHA</h1>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-0 md:gap-0">
        <KanbanColumn
          title="NOVOS"
          colorClass="text-primary"
          borderClass="border-primary"
          orders={newOrders}
          getItems={getItems}
          actionLabel="▶ PREPARAR"
          actionColor="bg-warning text-warning-foreground"
          onAction={(id) => updateStatus(id, "preparing")}
        />
        <KanbanColumn
          title="EM PREPARO"
          colorClass="text-warning"
          borderClass="border-warning"
          orders={preparing}
          getItems={getItems}
          actionLabel="✅ PRONTO"
          actionColor="bg-success text-success-foreground"
          onAction={(id) => updateStatus(id, "done")}
        />
        <KanbanColumn
          title="FINALIZADOS"
          colorClass="text-success"
          borderClass="border-success"
          orders={done}
          getItems={getItems}
        />
      </div>
    </div>
  );
};

export default Kitchen;
