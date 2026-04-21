import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Order, OrderItem } from "@/lib/types";
import KanbanColumn from "@/components/kitchen/KanbanColumn";
import { useFeedback } from "@/hooks/use-feedback";


const SOUND_KEY = "kitchen-sound-enabled";

const Kitchen = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { playFeedback } = useFeedback();
  const prevCountRef = useRef(0);
  const [pulseNew, setPulseNew] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(SOUND_KEY) !== "0";
  });

  const toggleSound = () => {
    setSoundEnabled((v) => {
      const next = !v;
      localStorage.setItem(SOUND_KEY, next ? "1" : "0");
      return next;
    });
  };

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
      .channel(`kitchen-realtime-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["kitchen-items"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Beep + pulse on new orders
  const newOrders = orders.filter((o) => o.status === "new");
  useEffect(() => {
    if (newOrders.length > prevCountRef.current) {
      if (soundEnabled) playFeedback("notification");
      setPulseNew(true);
      const t = setTimeout(() => setPulseNew(false), 4000);
      prevCountRef.current = newOrders.length;
      return () => clearTimeout(t);
    }
    prevCountRef.current = newOrders.length;
  }, [newOrders.length, playFeedback, soundEnabled]);

  const updateStatus = async (orderId: string, status: string) => {
    playFeedback("click");
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) {
      console.error("[Kitchen] updateStatus error:", error);
      alert("Erro ao atualizar pedido: " + error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
  };

  const getItems = (orderId: string) => allItems.filter((i) => i.order_id === orderId);

  const preparing = orders.filter((o) => o.status === "preparing");
  const done = orders.filter((o) => o.status === "done");

  return (
    <div className="min-h-screen-safe md:h-screen-dvh flex flex-col md:overflow-hidden">
      <div className="border-b border-border p-3 sm:p-4 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-[calc(1rem+env(safe-area-inset-top))] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <button onClick={() => navigate("/")} className="text-muted-foreground shrink-0">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg sm:text-2xl font-black tracking-tight truncate">PAINEL COZINHA</h1>
        </div>
        <button
          onClick={toggleSound}
          title={soundEnabled ? "Desativar som de novos pedidos" : "Ativar som de novos pedidos"}
          className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg border text-xs sm:text-sm font-bold transition-colors shrink-0 ${
            soundEnabled
              ? "border-success bg-success/10 text-success"
              : "border-border bg-card text-muted-foreground hover:bg-secondary"
          }`}
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          <span className="hidden sm:inline">{soundEnabled ? "SOM LIGADO" : "SOM DESLIGADO"}</span>
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 min-h-0 md:overflow-hidden overflow-y-auto">
        <KanbanColumn
          title="NOVOS"
          colorClass="text-primary"
          borderClass="border-primary"
          bgClass="bg-primary/5"
          orders={newOrders}
          getItems={getItems}
          actionLabel="▶ PREPARAR"
          actionColor="bg-warning text-warning-foreground"
          onAction={(id) => updateStatus(id, "preparing")}
          pulseNew={pulseNew}
        />
        <KanbanColumn
          title="EM PREPARO"
          colorClass="text-warning"
          borderClass="border-warning"
          bgClass="bg-warning/5"
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
          bgClass="bg-success/5"
          orders={done}
          getItems={getItems}
        />
      </div>
    </div>
  );
};

export default Kitchen;
