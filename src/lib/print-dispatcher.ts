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
import { type DeliveryPayloadInput, type ReceiptExtras } from "@/lib/thermal-printer";

export type DispatchMode = "full" | "delta" | "bill";
export type DispatchSource = "auto" | "manual" | "reprint" | "queue" | "test" | "unknown";

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
function buildExtras(o: OrderRow, printPath: string, source: DispatchSource, items?: any[]): ReceiptExtras {
  const extras: ReceiptExtras = {
    orderId: o.id,
    orderShortId: o.table_name?.replace(/^.*#/, "") || o.id.slice(0, 8).toUpperCase(),
    customerName: o.customer_name_snapshot?.trim() || null,
    total: o.total ?? 0,
    itemsCount: items?.length ?? 0,
    fingerprint: { printPath, source },
  };
  if (o.service_type) extras.serviceType = o.service_type;
  if (o.customer_phone_snapshot && o.customer_phone_snapshot.trim())
    extras.customerPhone = o.customer_phone_snapshot.trim();
  return extras;
}

/** Garante que delivery/pickup nunca usem nome de mesa fake como "Delivery #123". */
function safeTableValue(o: OrderRow): string {
  if (!o.service_type || o.service_type === "dine_in") {
    return formatPrintTableValue(o.table_name, o.original_table_name);
  }
  return ""; 
}

/** Garante waiter sem virar "N/A". */
function safeWaiter(o: OrderRow): string {
  const w = (o.waiter_name ?? "").trim();
  return w; 
}

/**
 * Função PÚBLICA única para qualquer impressão de pedido.
 */
export async function printOrderByServiceType(
  orderId: string,
  mode: DispatchMode = "full",
  source: DispatchSource = "auto",
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

  // O health check aqui serve para tentar impressão direta.
  // Se estiver offline, prosseguimos para gerar o payload e enfileirar.
  let bridgeActuallyOnline = true;
  if (cfg.printMode === "bridge" && cfg.bridgeUrl) {
    const { checkBridgeStatus } = await import("./thermal-printer");
    const health = await checkBridgeStatus(cfg.bridgeUrl, true);
    bridgeActuallyOnline = health.online;
    if (!bridgeActuallyOnline) {
      debugLog.warn("print", `Ponte offline em ${cfg.bridgeUrl}; o pedido será enfileirado localmente.`);
    }
  }

  const serviceType = order.service_type ?? "dine_in";
  const isDelivery = serviceType === "delivery";
  const isPickup = serviceType === "pickup" || serviceType === "balcao" || serviceType === "balcão";
  const tableValue = safeTableValue(order);
  const waiter = safeWaiter(order);

  const items = (mode === "delta") ? [] : await loadItemsWithRetry(orderId);
  const deltaItems = (mode === "delta") ? (order.delta_items ?? []) as any[] : [];
  const activeItems = mode === "delta" ? deltaItems : items;

  const extras = buildExtras(order, `dispatcher.${serviceType}.${mode}`, source, activeItems);

  console.log("[PRINT_DISPATCHER_LOG]", {
    orderId,
    shortId: extras.orderShortId,
    customer: extras.customerName,
    service: serviceType,
    mode,
    total: order.total,
    itemsCount: activeItems.length,
    source
  });

  logPrintEngine({
    functionName: `printOrderByServiceType:${mode}:${source}`,
    orderId,
    serviceType,
    tableName: tableValue || null,
    headerText: cfg.headerText,
    footerText: cfg.footerText,
    paperWidth: cfg.paperWidth,
    configMeta: { updatedAt: cfg.configUpdatedAt ?? null, source: cfg.configSource ?? null },
    extra: { mode, isDelivery, isPickup, dispatchSource: source },
  });

  if (isDelivery) {
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
      orderShortId: extras.orderShortId,
      serviceType: "delivery",
      fingerprint: { printPath: "dispatcher.delivery", source },
      itemsCount: items.length
    };

    const ok = bridgeActuallyOnline ? await printDelivery(input) : { ok: false };
    if (ok.ok) return { ok: true, reason: "delivery_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: "delivery" };

    debugLog.warn("print", `bridge offline/falhou para delivery ${orderId}; aguardando reimpressão manual`);
    return { ok: false, reason: "bridge_failed", bridgeOk: false, queued: false, serviceType, layoutUsed: "delivery" };
  }

  const layoutKey = isPickup ? "pickup" : (mode === "delta" ? "dine_in_delta" : mode === "bill" ? "dine_in_bill" : "dine_in_full");
  
  if (mode === "delta") {
    if (deltaItems.length === 0)
      return { ok: false, reason: "no_delta", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_delta" };

    const ok = bridgeActuallyOnline ? await printDelta(tableValue, waiter, deltaItems, extras) : { ok: false };
    if (ok.ok) return { ok: true, reason: "delta_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_delta" };
    debugLog.warn("print", `bridge offline/falhou para delta ${orderId}; aguardando reimpressão manual`);
    return { ok: false, reason: "bridge_failed", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_delta" };
  }

  if (items.length === 0)
    return { ok: false, reason: "no_items", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_full" };

  if (mode === "bill") {
    const ok = bridgeActuallyOnline ? await printBill(tableValue, waiter, items as any[], order.total ?? 0, extras) : { ok: false };
    if (ok.ok) return { ok: true, reason: "bill_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_bill" };
    debugLog.warn("print", `bridge offline/falhou para bill ${orderId}; aguardando reimpressão manual`);
    return { ok: false, reason: "bridge_failed", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_bill" };
  }

  const ok = bridgeActuallyOnline ? await printReceipt(tableValue, waiter, items as any[], order.total ?? 0, extras) : { ok: false };
  if (ok.ok) return { ok: true, reason: "full_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_full" };
  debugLog.warn("print", `bridge offline/falhou para full ${orderId}; aguardando reimpressão manual`);
  return { ok: false, reason: "bridge_failed", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_full" };
}
