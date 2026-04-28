/**
 * Runtime global de pedidos e impressão — Plano B Espetaria
 *
 * Singleton iniciado em main.tsx. Responsável SOZINHO por:
 * - Escutar Realtime de orders/order_items independentemente de tela aberta
 * - Disparar autoimpressão (Palm, Telegram, qualquer origem)
 * - Bootstrap de pedidos pending ao iniciar o app
 * - Watchdog de jobs presos em "printing"
 * - Fallback polling quando realtime estiver degradado
 *
 * Anti-duplicidade: Set local + RPC atômica claim_order_print no banco.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { autoPrintOrder } from "@/lib/print-service";
import { debugLog } from "@/lib/debug-logger";
import {
  markRealtimeHeartbeat,
  reportRealtime,
  subscribeConnectivity,
} from "@/lib/connectivity-store";
import type { Order } from "@/lib/types";

let started = false;
let channel: ReturnType<typeof supabase.channel> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let unsubConn: (() => void) | null = null;

/** IDs em processamento neste tab (evita disparar 2x do mesmo evento). */
const inFlight = new Set<string>();
/** Eventos já tratados (idempotência por evento, não por order). */
const handledEvents = new Set<string>();
/** Trava conservadora: autoimpressão automática roda no máximo 1x por order.id nesta sessão. */
const autoAttempted = new Set<string>();

function invalidateOrderCaches(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["pdv-orders"] });
  qc.invalidateQueries({ queryKey: ["pdv-items"] });
  qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
  qc.invalidateQueries({ queryKey: ["kitchen-items"] });
}

async function runAutoPrint(order: Order) {
  if (inFlight.has(order.id)) {
    debugLog.info("global-print", `skip — já em processamento ${order.id}`);
    return;
  }
  if ((order as any).printed_at || order.print_status === "printed") {
    debugLog.info("global-print", `skip — pedido já impresso ${order.id}`);
    return;
  }
  if (order.print_status === "printing") {
    debugLog.info("global-print", `skip — pedido já em impressão ${order.id}`);
    return;
  }
  if (order.print_status === "failed") {
    debugLog.info("global-print", `skip — pedido falhou e exige ação manual ${order.id}`);
    return;
  }
  if (autoAttempted.has(order.id)) {
    debugLog.info("global-print", `skip — autoimpressão já tentada para ${order.id}`);
    return;
  }

  autoAttempted.add(order.id);
  inFlight.add(order.id);
  try {
    const result = await autoPrintOrder(order);

    if (result.printed) {
      debugLog.success(
        "global-print",
        `impressão concluída pedido ${order.id} reason=${result.reason}`,
      );
    } else if (result.reason === "already_claimed") {
      debugLog.info("global-print", `claim recusado (outra instância) ${order.id}`);
    } else {
      debugLog.warn("global-print", `não imprimiu motivo=${result.reason} ${order.id}`);
    }
  } catch (err) {
    debugLog.error("global-print", `erro autoimpressão ${order.id}`, err);
  } finally {
    inFlight.delete(order.id);
  }
}

async function bootstrapPending() {
  debugLog.warn(
    "global-orders",
    "bootstrap de pendentes desativado no modo conservador para evitar reimpressão de backlog",
  );
}

export function startGlobalOrderRuntime(queryClient: QueryClient): void {
  if (started) {
    debugLog.warn("global-orders", "já estava iniciado — ignorando");
    return;
  }
  started = true;
  debugLog.info("global-orders", "runtime iniciado");

  const channelName = `global-orders-runtime-${crypto.randomUUID()}`;

  channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "orders" },
      (payload) => {
        markRealtimeHeartbeat();
        const order = payload.new as Order;
        const eventKey = `${order.id}:insert`;
        if (handledEvents.has(eventKey)) return;
        handledEvents.add(eventKey);

        invalidateOrderCaches(queryClient);
        debugLog.info(
          "global-orders",
          `INSERT pedido ${order.id} mesa ${order.table_name} waiter=${order.waiter_name ?? "-"}`,
        );
        if (order.print_status === "pending") {
          runAutoPrint(order);
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "orders" },
      (payload) => {
        markRealtimeHeartbeat();
        const updated = payload.new as Order;
        const old = payload.old as Partial<Order>;

        invalidateOrderCaches(queryClient);

        const printStateChanged = updated.print_status !== old.print_status;
        if (printStateChanged) {
          debugLog.info(
            "global-orders",
            `UPDATE pedido ${updated.id} print_status ${old.print_status ?? "-"} -> ${updated.print_status}`,
          );
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "order_items" },
      () => {
        markRealtimeHeartbeat();
        queryClient.invalidateQueries({ queryKey: ["pdv-items"] });
        queryClient.invalidateQueries({ queryKey: ["kitchen-items"] });
      },
    )
    .subscribe((status) => {
      const online = status === "SUBSCRIBED";
      debugLog[online ? "success" : "warn"](
        "global-orders",
        `canal realtime status=${status}`,
      );
      reportRealtime(status);

      if (online) bootstrapPending();
    });

  // Fallback polling quando realtime degradado/offline
  unsubConn = subscribeConnectivity((s) => {
    const needsPoll = s.realtime === "degraded" || s.realtime === "offline";
    if (needsPoll && !pollTimer) {
      debugLog.warn("global-orders", "fallback polling 10s ativo");
      pollTimer = setInterval(() => {
        invalidateOrderCaches(queryClient);
      }, 10_000);
    } else if (!needsPoll && pollTimer) {
      debugLog.success("global-orders", "fallback polling desativado");
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  // Bootstrap inicial desativado no modo conservador.
  void bootstrapPending();

  // Limpa cache de eventos antigos a cada 5min p/ não vazar memória
  setInterval(() => {
    if (handledEvents.size > 500) {
      handledEvents.clear();
      debugLog.info("global-orders", "handledEvents cache limpo");
    }
  }, 5 * 60_000);
}

export function stopGlobalOrderRuntime(): void {
  if (!started) return;
  started = false;
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (unsubConn) {
    unsubConn();
    unsubConn = null;
  }
  inFlight.clear();
  autoAttempted.clear();
  handledEvents.clear();
  debugLog.info("global-orders", "runtime parado");
}
