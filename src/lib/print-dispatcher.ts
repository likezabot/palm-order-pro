/**
 * DISPATCHER ÚNICO de impressão.
 *
 * Toda impressão de pedido REAL deve passar por aqui. O dispatcher:
 *  1. Carrega o pedido + items do banco
 *  2. Lê service_type (delivery / pickup / dine_in)
 *  3. Escolhe o layout correto (jamais delivery/pickup caem em layout de mesa)
 *  4. Emite via printDelivery / printReceipt / printDelta / printBill
 *  5. Em falha, enfileira payload ESC/POS para a Central
 *
 * NÃO mexe em: bridge, EXE, USB, print_jobs, fila — só orquestra a camada web.
 */
import { supabase } from "@/integrations/supabase/client";
import { ensureFreshPrintConfig } from "@/lib/print-config";
import { formatPrintTableValue } from "@/lib/utils";
import { debugLog } from "@/lib/debug-logger";
import { logPrintEngine } from "@/lib/print-engine";
import { printReceipt, printDelta, printBill, printDelivery } from "@/lib/print-receipt";
import {
  buildEscPosReceipt,
  buildEscPosDelta,
  buildEscPosBill,
  buildEscPosDelivery,
  type DeliveryPayloadInput,
  type ReceiptExtras,
} from "@/lib/thermal-printer";
import { encodePayloadB64, enqueuePrintJob, type PrintJobType } from "@/lib/print-queue";

export type DispatchMode = "full" | "delta" | "bill";

export interface DispatchResult {
  ok: boolean;
  reason: string;
  bridgeOk: boolean;
  queued: boolean;
  serviceType: string | null;
  layoutUsed: "delivery" | "pickup" | "dine_in_full" | "dine_in_delta" | "dine_in_bill";
}

interface OrderRow {
  id: string;
  table_name: string;
  original_table_name: string | null;
  waiter_name: string | null;
  total: number | null;
  service_type: string | null;
  delivery_address: any;
  delivery_fee: number | null;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  payment_method: string | null;
  change_for: number | null;
  delta_items: any;
  print_type: string | null;
}

async function loadOrderForPrint(orderId: string): Promise<OrderRow | null> {
  const { data } = await supabase
    .from("orders")
    .select(
      "id, table_name, original_table_name, waiter_name, total, service_type, delivery_address, delivery_fee, customer_name_snapshot, customer_phone_snapshot, payment_method, change_for, delta_items, print_type",
    )
    .eq("id", orderId)
    .single();
  return (data as any) ?? null;
}

async function loadItemsWithRetry(orderId: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data } = await supabase.from("order_items").select("*").eq("order_id", orderId);
    if (data && data.length > 0) return data;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return [];
}

/**
 * Sanitiza extras: NUNCA imprimir N/A. Campos vazios são removidos para que
 * o layout simplesmente não renderize a linha.
 */
function buildExtras(o: OrderRow, printPath: string, source: "auto" | "manual" | "reprint" | "queue" | "unknown"): ReceiptExtras {
  const extras: ReceiptExtras = {
    orderId: o.id,
    fingerprint: { printPath, source },
  };
  if (o.service_type) extras.serviceType = o.service_type;
  if (o.customer_name_snapshot && o.customer_name_snapshot.trim())
    extras.customerName = o.customer_name_snapshot.trim();
  if (o.customer_phone_snapshot && o.customer_phone_snapshot.trim())
    extras.customerPhone = o.customer_phone_snapshot.trim();
  return extras;
}

/** Garante que delivery/pickup nunca usem nome de mesa fake como "Delivery #123". */
function safeTableValue(o: OrderRow): string {
  // Para dine_in usa o formato normal; para outros tipos passa string vazia
  // (o layout suprime o bloco MESA quando service_type não é dine_in).
  if (!o.service_type || o.service_type === "dine_in") {
    return formatPrintTableValue(o.table_name, o.original_table_name);
  }
  return ""; // o layout não imprimirá MESA
}

/** Garante waiter sem virar "N/A". */
function safeWaiter(o: OrderRow): string {
  const w = (o.waiter_name ?? "").trim();
  return w; // string vazia => layout omite a linha
}

async function tryEnqueue(
  orderId: string,
  tableValue: string,
  jobType: PrintJobType,
  payload: Uint8Array,
): Promise<boolean> {
  try {
    const cfg = await ensureFreshPrintConfig();
    if (cfg.printMode !== "bridge" || !cfg.bridgeUrl) return false;
    await enqueuePrintJob({
      orderId,
      tableName: tableValue || `pedido-${orderId.slice(0, 6)}`,
      printType: jobType,
      payloadB64: encodePayloadB64(payload),
      bridgeUrl: cfg.bridgeUrl,
      lastError: "bridge_offline",
    });
    return true;
  } catch (e) {
    debugLog.error("queue", "dispatcher enqueue falhou", e);
    return false;
  }
}

/**
 * Função PÚBLICA única para qualquer impressão de pedido.
 */
export async function printOrderByServiceType(
  orderId: string,
  mode: DispatchMode = "full",
): Promise<DispatchResult> {
  const order = await loadOrderForPrint(orderId);
  if (!order) {
    return {
      ok: false,
      reason: "order_not_found",
      bridgeOk: false,
      queued: false,
      serviceType: null,
      layoutUsed: "dine_in_full",
    };
  }

  const cfg = await ensureFreshPrintConfig();
  const serviceType = order.service_type ?? "dine_in";
  const isDelivery = serviceType === "delivery";
  const isPickup = serviceType === "pickup" || serviceType === "balcao";
  const tableValue = safeTableValue(order);
  const waiter = safeWaiter(order);

  logPrintEngine({
    functionName: `printOrderByServiceType:${mode}`,
    orderId,
    serviceType,
    tableName: tableValue || null,
    headerText: cfg.headerText,
    footerText: cfg.footerText,
    paperWidth: cfg.paperWidth,
    configMeta: { updatedAt: cfg.configUpdatedAt ?? null, source: cfg.configSource ?? null },
    extra: { mode, isDelivery, isPickup },
  });

  // ---- DELIVERY: SEMPRE comanda completa, nunca delta/bill em layout mesa ----
  if (isDelivery) {
    const items = await loadItemsWithRetry(orderId);
    if (items.length === 0)
      return { ok: false, reason: "no_items", bridgeOk: false, queued: false, serviceType, layoutUsed: "delivery" };

    const subtotal = (items as any[]).reduce(
      (s, i) => s + Number(i.product_price) * Number(i.quantity),
      0,
    );
    const deliveryFee = Number(order.delivery_fee ?? 0);
    const input: DeliveryPayloadInput = {
      items: items as any[],
      customerName: order.customer_name_snapshot,
      customerPhone: order.customer_phone_snapshot,
      deliveryAddress: order.delivery_address,
      deliveryFee,
      subtotal,
      total: order.total ?? subtotal + deliveryFee,
      paymentMethod: order.payment_method,
      changeFor: order.change_for != null ? Number(order.change_for) : null,
      orderId,
      orderShortId: order.table_name?.replace(/^.*#/, "") || null,
      serviceType: "delivery",
      fingerprint: { printPath: "dispatcher.delivery", source: "auto" },
    };

    const ok = await printDelivery(input);
    if (ok) return { ok: true, reason: "delivery_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: "delivery" };

    const payload = buildEscPosDelivery(input, cfg);
    const queued = await tryEnqueue(orderId, tableValue, "full", payload);
    return { ok: queued, reason: queued ? "queued" : "bridge_failed", bridgeOk: false, queued, serviceType, layoutUsed: "delivery" };
  }

  // ---- PICKUP: layout receipt SEM bloco MESA (handled by serviceType extra) ----
  // ---- DINE_IN: layout normal de mesa ----
  const layoutKey = isPickup ? "pickup" : (mode === "delta" ? "dine_in_delta" : mode === "bill" ? "dine_in_bill" : "dine_in_full");
  const printPath = `dispatcher.${layoutKey}.${mode}`;
  const extras = buildExtras(order, printPath, "auto");

  if (mode === "delta") {
    const deltaItems = (order.delta_items ?? []) as any[];
    if (!deltaItems || deltaItems.length === 0)
      return { ok: false, reason: "no_delta", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_delta" };

    const ok = await printDelta(tableValue, waiter, deltaItems, extras);
    if (ok) return { ok: true, reason: "delta_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_delta" };
    const payload = buildEscPosDelta(tableValue, waiter, deltaItems, cfg, extras);
    const queued = await tryEnqueue(orderId, tableValue, "delta", payload);
    return { ok: queued, reason: queued ? "queued" : "bridge_failed", bridgeOk: false, queued, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_delta" };
  }

  const items = await loadItemsWithRetry(orderId);
  if (items.length === 0)
    return { ok: false, reason: "no_items", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_full" };

  if (mode === "bill") {
    const ok = await printBill(tableValue, waiter, items as any[], order.total ?? 0, extras);
    if (ok) return { ok: true, reason: "bill_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_bill" };
    const payload = buildEscPosBill(tableValue, waiter, items as any[], order.total ?? 0, cfg, extras);
    const queued = await tryEnqueue(orderId, tableValue, "bill", payload);
    return { ok: queued, reason: queued ? "queued" : "bridge_failed", bridgeOk: false, queued, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_bill" };
  }

  // mode === "full"
  const ok = await printReceipt(tableValue, waiter, items as any[], order.total ?? 0, extras);
  if (ok) return { ok: true, reason: "full_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_full" };
  const payload = buildEscPosReceipt(tableValue, waiter, items as any[], order.total ?? 0, cfg, extras);
  const queued = await tryEnqueue(orderId, tableValue, "full", payload);
  return { ok: queued, reason: queued ? "queued" : "bridge_failed", bridgeOk: false, queued, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_full" };
}
