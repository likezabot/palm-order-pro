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
import { autoPrintOrder, autoPrintUpdate } from "@/lib/print-service";
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
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let unsubConn: (() => void) | null = null;

/** IDs em processamento neste tab (evita disparar 2x do mesmo evento). */
const inFlight = new Set<string>();
/** Eventos já tratados (idempotência por evento, não por order). */
const handledEvents = new Set<string>();
/** Cooldown por order_id — circuit breaker contra loops de re-impressão. */
const recentlyAttempted = new Map<string, number>();
const COOLDOWN_MS = 30_000;

function invalidateOrderCaches(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["pdv-orders"] });
  qc.invalidateQueries({ queryKey: ["pdv-items"] });
  qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
  qc.invalidateQueries({ queryKey: ["kitchen-items"] });
}

async function runAutoPrint(order: Order, isUpdate: boolean) {
  if (inFlight.has(order.id)) {
    debugLog.info("global-print", `skip — já em processamento ${order.id}`);
    return;
  }
  const lastAttempt = recentlyAttempted.get(order.id);
  if (lastAttempt && Date.now() - lastAttempt < COOLDOWN_MS) {
    debugLog.info(
      "global-print",
      `skip — cooldown ativo ${order.id} (último há ${Date.now() - lastAttempt}ms)`,
    );
    return;
  }
  recentlyAttempted.set(order.id, Date.now());
  inFlight.add(order.id);
  try {
    const result = isUpdate
      ? await autoPrintUpdate(order)
      : await autoPrintOrder(order);

    if (result.printed) {
      debugLog.success(
        "global-print",
        `impressão concluída pedido ${order.id} reason=${result.reason}`,
      );
    } else if (result.reason === "already_claimed") {
      debugLog.info("global-print", `claim recusado (outra instância) ${order.id}`);
    } else if (result.reason === "bridge_offline_queued") {
      debugLog.warn("global-print", `queued bridge_offline pedido ${order.id}`);
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
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("print_status", "pending")
      .in("status", ["new", "preparing", "done", "paid"])
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      debugLog.error("global-orders", "bootstrap query falhou", error);
      return;
    }

    const list = (data || []) as Order[];
    debugLog.info("global-orders", `bootstrap pendentes: ${list.length}`);

    for (const order of list) {
      const isUpdate = !!(order.print_type || (order as any).delta_items);
      debugLog.info(
        "global-orders",
        `bootstrap recuperado pedido ${order.id} mesa ${order.table_name} updateMode=${isUpdate}`,
      );
      // Sequencial para não saturar a impressora
      await runAutoPrint(order, isUpdate);
    }
  } catch (err) {
    debugLog.error("global-orders", "bootstrap falhou", err);
  }
}

async function runWatchdog() {
  try {
    const { data, error } = await supabase.rpc("requeue_stuck_print_jobs", {
      p_seconds: 90,
    } as any);
    if (error) {
      debugLog.error("global-orders", "watchdog requeue erro", error);
      return;
    }
    const requeued = (data as any)?.requeued ?? 0;
    if (requeued > 0) {
      debugLog.warn("global-orders", `watchdog: requeued=${requeued}`);
    }
  } catch (err) {
    debugLog.error("global-orders", "watchdog exception", err);
  }
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
        runAutoPrint(order, false);
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

        const totalChanged = updated.total !== old.total;
        // printReset: só se passou de algum estado terminal/intermediário PARA pending.
        // Crucial: ignora 'queued' → 'pending' (acontece se o worker completou)
        // e ignora 'pending' → 'pending' (no-op).
        const printReset =
          updated.print_status === "pending" &&
          old.print_status !== "pending" &&
          old.print_status !== "queued";

        if (totalChanged || printReset) {
          const eventKey = `${updated.id}:upd:${updated.updated_at}`;
          if (handledEvents.has(eventKey)) return;
          handledEvents.add(eventKey);

          debugLog.info(
            "global-orders",
            `UPDATE relevante pedido ${updated.id} mesa ${updated.table_name} totalChanged=${totalChanged} printReset=${printReset}`,
          );
          runAutoPrint(updated, true);
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

      if (online) {
        // Ao (re)conectar, rebusca pendentes — recobre lacuna offline.
        bootstrapPending();
      }
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

  // Watchdog: a cada 90s recupera jobs presos em "printing"
  watchdogTimer = setInterval(runWatchdog, 90_000);

  // Bootstrap inicial — pega pedidos pendentes que chegaram com app fechado
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
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  if (unsubConn) {
    unsubConn();
    unsubConn = null;
  }
  inFlight.clear();
  handledEvents.clear();
  debugLog.info("global-orders", "runtime parado");
}
