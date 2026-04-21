import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";
import { autoPrintOrder, autoPrintDelta } from "@/lib/print-service";
import { debugLog } from "@/lib/debug-logger";
import type { Order } from "@/lib/types";

/**
 * Hook que gerencia a subscription Realtime do PDV.
 *
 * Mantém comportamento idêntico ao original em Pdv.tsx:
 * - Subscription estável (depende só de queryClient)
 * - Refs para idempotência (printedEventsRef, printingNowRef)
 * - Auto-print com guarda anti-duplicação
 * - Toast em INSERT, invalidate em UPDATE de order_items
 */
export function usePdvRealtime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playFeedback } = useFeedback();
  const [realtimeStatus, setRealtimeStatus] = useState<"online" | "offline">("offline");

  const printedEventsRef = useRef<Set<string>>(new Set());
  const printingNowRef = useRef<Set<string>>(new Set());
  const toastRef = useRef(toast);
  const playFeedbackRef = useRef(playFeedback);

  useEffect(() => { toastRef.current = toast; }, [toast]);
  useEffect(() => { playFeedbackRef.current = playFeedback; }, [playFeedback]);

  const tryAutoPrintRef = useRef(async (order: Order, eventKey: string, isUpdate: boolean) => {
    if (printedEventsRef.current.has(eventKey)) return;
    if (printingNowRef.current.has(order.id)) return;

    printedEventsRef.current.add(eventKey);
    printingNowRef.current.add(order.id);

    console.log(`[PDV AutoPrint] Aguardando itens do pedido ${order.id} (Mesa ${order.table_name})...`);
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const result = isUpdate
        ? await autoPrintDelta(order)
        : await autoPrintOrder(order);

      if (result.printed) {
        const msg = result.reason === "delta_success"
          ? `Acréscimo impresso — Mesa ${order.table_name}`
          : `Impresso automaticamente — Mesa ${order.table_name}`;
        console.log(`[PDV AutoPrint] ${msg}`);
        toastRef.current({ title: msg });
      } else if (result.reason === "bridge_offline_queued") {
        console.warn(`[PDV AutoPrint] Bridge offline — Mesa ${order.table_name} enfileirada.`);
        toastRef.current({
          title: `Bridge offline — Mesa ${order.table_name}`,
          description: "Pedido enfileirado. Será reimpresso automaticamente quando o bridge voltar.",
          variant: "destructive",
        });
      } else {
        console.warn(`[PDV AutoPrint] Não imprimiu: ${result.reason}`);
      }
    } catch (error) {
      console.error("[PDV AutoPrint] Falha na autoimpressão:", error);
    } finally {
      printingNowRef.current.delete(order.id);
    }
  });

  useEffect(() => {
    const channelName = `pdv-realtime-${crypto.randomUUID()}`;
    debugLog.info("realtime", `→ inscrevendo canal ${channelName}`);

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
        queryClient.invalidateQueries({ queryKey: ["pdv-items"] });
        const newOrder = payload.new as Order;
        debugLog.info("realtime", `[${channelName}] INSERT orders`, { id: newOrder.id, table: newOrder.table_name });
        playFeedbackRef.current("notification");
        toastRef.current({ title: `Novo pedido! Mesa ${newOrder.table_name}` });
        const eventKey = `${newOrder.id}:insert`;
        tryAutoPrintRef.current(newOrder, eventKey, false);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
        const updated = payload.new as Order;
        const old = payload.old as Partial<Order>;
        const totalChanged = updated.total !== old.total;
        const printReset = updated.print_status === 'pending' && (old as Partial<Order>).print_status !== 'pending';

        if (totalChanged || printReset) {
          debugLog.info("realtime", `[${channelName}] UPDATE relevante`, {
            id: updated.id, table: updated.table_name, totalChanged, printReset, printStatus: updated.print_status,
          });
          const eventKey = `${updated.id}:upd:${updated.updated_at}`;
          tryAutoPrintRef.current(updated, eventKey, true);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pdv-items"] });
      })
      .subscribe((status) => {
        const online = status === "SUBSCRIBED";
        debugLog[online ? "success" : "warn"]("realtime", `[${channelName}] status: ${status}`);
        setRealtimeStatus(online ? "online" : "offline");
      });

    return () => {
      debugLog.info("realtime", `← removendo canal ${channelName}`);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { realtimeStatus };
}
