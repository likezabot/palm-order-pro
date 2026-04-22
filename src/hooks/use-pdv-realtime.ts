import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";
import { debugLog } from "@/lib/debug-logger";
import { reportRealtime, markRealtimeHeartbeat, subscribeConnectivity } from "@/lib/connectivity-store";
import type { Order } from "@/lib/types";

/**
 * Hook que gerencia a subscription Realtime do PDV — APENAS UI.
 *
 * IMPORTANTE: a autoimpressão foi movida para `src/lib/global-order-runtime.ts`,
 * que roda independente de tela aberta. Aqui só:
 * - mantém status do realtime para o badge ONLINE/OFFLINE
 * - invalida queries da UI (toast + atualização visual)
 * - emite som/feedback para o operador do PDV
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

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        markRealtimeHeartbeat();
        queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
        queryClient.invalidateQueries({ queryKey: ["pdv-items"] });
        const newOrder = payload.new as Order;
        debugLog.info("realtime", `[${channelName}] INSERT orders`, { id: newOrder.id, table: newOrder.table_name });
        playFeedbackRef.current("notification");
        toastRef.current({ title: `Novo pedido! Mesa ${newOrder.table_name}` });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () => {
        markRealtimeHeartbeat();
        queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        markRealtimeHeartbeat();
        queryClient.invalidateQueries({ queryKey: ["pdv-items"] });
      })
      .subscribe((status) => {
        const online = status === "SUBSCRIBED";
        debugLog[online ? "success" : "warn"]("realtime", `[${channelName}] status: ${status}`);
        setRealtimeStatus(online ? "online" : "offline");
        reportRealtime(status);
      });

    // Fallback polling: quando realtime degradado/offline, recarrega a cada 10s.
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
      unsubConn();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { realtimeStatus };
}
