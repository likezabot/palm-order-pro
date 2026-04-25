import type { Order } from "./types";

export type OrderGroup = "delivery" | "tables";
export type OrderKind = "delivery" | "pickup" | "dine_in" | "counter";

/**
 * Classifica um pedido nos dois grupos visuais do PDV.
 * - delivery + pickup → ENTREGAS
 * - dine_in / mesa / balcão → MESAS
 */
export function getOrderKind(order: Order): OrderKind {
  const svc = (order.service_type || "").toLowerCase();
  if (svc === "delivery") return "delivery";
  if (svc === "pickup") return "pickup";
  // BALCÃO da Palm: tratamos como counter (entra em MESAS, badge BALCÃO)
  if ((order.table_name || "").toUpperCase() === "BALCÃO") return "counter";
  return "dine_in";
}

export function getOrderGroup(order: Order): OrderGroup {
  const k = getOrderKind(order);
  return k === "delivery" || k === "pickup" ? "delivery" : "tables";
}

export function isOnlineOrder(order: Order): boolean {
  return (order.channel || "").toLowerCase() === "online";
}

export const KIND_LABEL: Record<OrderKind, string> = {
  delivery: "ENTREGA",
  pickup: "RETIRADA",
  dine_in: "MESA",
  counter: "BALCÃO",
};

export const KIND_BADGE_CLASS: Record<OrderKind, string> = {
  delivery: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  pickup: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  dine_in: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  counter: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};
