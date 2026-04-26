import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Order, OrderItem } from "@/lib/types";
import KanbanColumn from "@/components/kitchen/KanbanColumn";
import { useFeedback } from "@/hooks/use-feedback";
import { useToast } from "@/hooks/use-toast";


const SOUND_KEY = "kitchen-sound-enabled";

const Kitchen = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { playFeedback } = useFeedback();
  const { toast } = useToast();
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

  const sortOrders = (rows: Order[]) =>
    [...rows].sort((a, b) => {
      const aServed = a.served_at ? 1 : 0;
      const bServed = b.served_at ? 1 : 0;
      if (aServed !== bServed) return aServed - bServed;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const { data: orders = [] } = useQuery({
    queryKey: ["kitchen-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["new", "preparing", "done"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return sortOrders((data as Order[]) ?? []);
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: allItems = [] } = useQuery({
    queryKey: ["kitchen-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_items").select("*");
      if (error) throw error;
      return data as OrderItem[];
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Realtime subscription com setQueryData direto (UI instantânea)
  useEffect(() => {
    let itemsReconcile: ReturnType<typeof setTimeout> | null = null;
    const scheduleItemsReconcile = () => {
      if (itemsReconcile) clearTimeout(itemsReconcile);
      itemsReconcile = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["kitchen-items"] });
      }, 400);
    };

    const channel = supabase
      .channel(`kitchen-realtime-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const newOrder = payload.new as Order;
        if (!["new", "preparing", "done"].includes(newOrder.status)) return;
        queryClient.setQueryData<Order[]>(["kitchen-orders"], (old) => {
          if (!old) return [newOrder];
          if (old.some((o) => o.id === newOrder.id)) return old;
          return sortOrders([...old, newOrder]);
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const updated = payload.new as Order;
        queryClient.setQueryData<Order[]>(["kitchen-orders"], (old) => {
          if (!old) return old;
          const inKitchen = ["new", "preparing", "done"].includes(updated.status);
          const existing = old.find((o) => o.id === updated.id);
          if (!existing && inKitchen) return sortOrders([...old, updated]);
          if (existing && !inKitchen) return old.filter((o) => o.id !== updated.id);
          if (!existing) return old;
          // Guard de versão
          if (typeof existing.version === "number" && typeof updated.version === "number" && updated.version < existing.version) {
            return old;
          }
          return sortOrders(old.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders" }, (payload) => {
        const oldOrder = payload.old as { id?: string };
        if (!oldOrder?.id) return;
        queryClient.setQueryData<Order[]>(["kitchen-orders"], (old) => old?.filter((o) => o.id !== oldOrder.id) ?? old);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, (payload) => {
        const event = payload.eventType;
        queryClient.setQueryData<OrderItem[]>(["kitchen-items"], (old) => {
          if (!old) return old;
          if (event === "DELETE") {
            const oldItem = payload.old as OrderItem;
            return old.filter((i) => i.id !== oldItem.id);
          }
          const newItem = payload.new as OrderItem;
          const idx = old.findIndex((i) => i.id === newItem.id);
          if (idx === -1) return [...old, newItem];
          const next = old.slice();
          next[idx] = { ...next[idx], ...newItem };
          return next;
        });
        scheduleItemsReconcile();
      })
      .subscribe();

    return () => {
      if (itemsReconcile) clearTimeout(itemsReconcile);
      supabase.removeChannel(channel);
    };
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
    // Optimistic update: muda o card de coluna instantaneamente
    const previous = queryClient.getQueryData<Order[]>(["kitchen-orders"]);
    queryClient.setQueryData<Order[]>(["kitchen-orders"], (old) => {
      if (!old) return old;
      return old.map((o) => (o.id === orderId ? { ...o, status, served_at: status === "done" ? new Date().toISOString() : o.served_at } : o));
    });

    const { error } = await supabase.rpc("update_order_status", {
      p_order_id: orderId,
      p_status: status,
    });

    if (error) {
      // Rollback
      if (previous) queryClient.setQueryData(["kitchen-orders"], previous);
      console.error("[Kitchen] updateStatus error:", error);
      toast({ title: "Erro ao atualizar pedido", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
    }
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
