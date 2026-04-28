import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";
import { debugLog } from "@/lib/debug-logger";
import { reportRealtime, markRealtimeHeartbeat, subscribeConnectivity } from "@/lib/connectivity-store";
import type { Order, OrderItem } from "@/lib/types";

/**
 * Realtime do PDV — agora aplica setQueryData direto no cache (UI instantânea)
 * em vez de invalidateQueries (que dispara refetch). Mantém invalidação
 * debounced só como reconciliação de fundo.
 */
export function usePdvRealtime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playFeedback } = useFeedback();
  const [realtimeStatus, setRealtimeStatus] = useState<"online" | "offline">("offline");

  const toastRef = useRef(toast);
  const playFeedbackRef = useRef(playFeedback);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  useEffect(() => { playFeedbackRef.current = playFeedback; }, [playFeedback]);

  useEffect(() => {
    const channelName = `pdv-ui-${crypto.randomUUID()}`;
    debugLog.info("realtime", `→ inscrevendo canal UI ${channelName}`);

    // Reconciliação debounced (rede de segurança)
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReconcile = () => {
      if (reconcileTimer) clearTimeout(reconcileTimer);
      reconcileTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
        queryClient.invalidateQueries({ queryKey: ["pdv-items"] });
      }, 2_000);
    };

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        markRealtimeHeartbeat();
        const newOrder = payload.new as Order;
        
        // Ignorar se o status não for ativo
        if (!["new", "preparing", "done"].includes(newOrder.status)) return;

        // Insere otimisticamente no cache de pedidos
        queryClient.setQueryData<Order[]>(["pdv-orders"], (old) => {
          if (!old) return [newOrder];
          if (old.some((o) => o.id === newOrder.id)) return old;
          return [newOrder, ...old];
        });
        debugLog.info("realtime", `[${channelName}] INSERT orders`, { id: newOrder.id, table: newOrder.table_name });
        playFeedbackRef.current("notification");
        toastRef.current({ title: `Novo pedido! Mesa ${newOrder.table_name}` });
        scheduleReconcile();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        markRealtimeHeartbeat();
        const updated = payload.new as Order;
        const activeStatuses = ["new", "preparing", "done"];
        const isCancelled = updated.status === "cancelled";

        
        queryClient.setQueryData<Order[]>(["pdv-orders"], (old) => {
          if (!old) return old;
          
          const isCurrentlyActive = activeStatuses.includes(updated.status);
          const existsInCache = old.some(o => o.id === updated.id);

          // Se mudou para um status não ativo (ex: paid), remove do cache
          if (!isCurrentlyActive) {
            return old.filter(o => o.id !== updated.id);
          }

          // Se é ativo mas não estava no cache, adiciona
          if (!existsInCache) {
            return [updated, ...old];
          }

          // Se já existe, atualiza normal
          return old.map((o) => {
            if (o.id !== updated.id) return o;
            if (typeof o.version === "number" && typeof updated.version === "number" && updated.version < o.version) {
              return o;
            }
            return { ...o, ...updated };
          });
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders" }, (payload) => {
        markRealtimeHeartbeat();
        const oldOrder = payload.old as { id?: string };
        if (!oldOrder?.id) return;
        queryClient.setQueryData<Order[]>(["pdv-orders"], (old) => {
          if (!old) return old;
          return old.filter((o) => o.id !== oldOrder.id);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, (payload) => {
        markRealtimeHeartbeat();
        const event = payload.eventType;
        const row = (payload.new ?? payload.old) as Partial<OrderItem> | undefined;
        const orderId = row?.order_id;
        if (orderId) {
          queryClient.setQueryData<OrderItem[]>(["pdv-items", orderId], (old) => {
            if (!old) return old;
            if (event === "DELETE") {
              return old.filter((i) => i.id !== (payload.old as OrderItem).id);
            }
            const newItem = payload.new as OrderItem;
            const idx = old.findIndex((i) => i.id === newItem.id);
            if (idx === -1) return [...old, newItem];
            const next = old.slice();
            next[idx] = { ...next[idx], ...newItem };
            return next;
          });
        }
        scheduleReconcile();
      })
      .subscribe((status) => {
        const online = status === "SUBSCRIBED";
        debugLog[online ? "success" : "warn"]("realtime", `[${channelName}] status: ${status}`);
        setRealtimeStatus(online ? "online" : "offline");
        reportRealtime(status);
      });

    // Fallback polling: quando realtime degradado/offline.
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const unsubConn = subscribeConnectivity((s) => {
      const needsPoll = s.realtime === "degraded" || s.realtime === "offline";
      if (needsPoll && !pollTimer) {
        debugLog.warn("realtime", "ativando fallback polling 10s");
        pollTimer = setInterval(() => {
          queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
          queryClient.invalidateQueries({ queryKey: ["pdv-items"] });
        }, 10_000);
      } else if (!needsPoll && pollTimer) {
        debugLog.success("realtime", "desativando fallback polling");
        clearInterval(pollTimer);
        pollTimer = null;
      }
    });

    return () => {
      debugLog.info("realtime", `← removendo canal ${channelName}`);
      if (pollTimer) clearInterval(pollTimer);
      if (reconcileTimer) clearTimeout(reconcileTimer);
      unsubConn();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { realtimeStatus };
}
