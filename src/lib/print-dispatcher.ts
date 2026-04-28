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
import { auditTestLogger } from "@/lib/audit-test-logger";
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
  status: string;
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
      "id, table_name, status, original_table_name, waiter_name, total, service_type, delivery_address, delivery_fee, customer_name_snapshot, customer_phone_snapshot, payment_method, change_for, delta_items, print_type",
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

  if (order.status === "cancelled" && source !== "reprint") {
    return {
      ok: false,
      reason: "order_cancelled",
      bridgeOk: false,
      queued: false,
      serviceType: order.service_type,
      layoutUsed: "dine_in_full",
    };
  }

  const cfg = await ensureFreshPrintConfig();
  const serviceType = order.service_type ?? "dine_in";
  const isDelivery = serviceType === "delivery";
  const isPickup = serviceType === "pickup" || serviceType === "balcao" || serviceType === "balcão";
  const tableValue = safeTableValue(order);
  const waiter = safeWaiter(order);

  const items = (mode === "delta") ? [] : await loadItemsWithRetry(orderId);
  const deltaItems = (mode === "delta") ? (order.delta_items ?? []) as any[] : [];
  const activeItems = mode === "delta" ? deltaItems : items;

  const printPath = `dispatcher.${serviceType}.${mode}`;
  const extras = buildExtras(order, printPath, source, activeItems);

  // LOG OBRIGATÓRIO: ANTES DE IMPRIMIR
  console.log("[PRINT_PIPELINE] ANTES DE IMPRIMIR:", {
    orderId,
    shortId: extras.orderShortId,
    customer: extras.customerName,
    serviceType,
    total: order.total,
    itemsCount: activeItems.length,
    printStatus: "loading", // será atualizado pelo service
    source,
    printPath
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

  let bridgeActuallyOnline = true;
  if (cfg.printMode === "bridge" && cfg.bridgeUrl) {
    const { checkBridgeStatus } = await import("./thermal-printer");
    const health = await checkBridgeStatus(cfg.bridgeUrl, true);
    bridgeActuallyOnline = health.online;
  }

  const sendToBridge = async (printFn: () => Promise<{ ok: boolean; error?: string }>) => {
    // LOG OBRIGATÓRIO: ANTES DE ENVIAR PARA BRIDGE
    console.log("[PRINT_PIPELINE] ENVIANDO PARA BRIDGE:", {
      bridgeUrl: cfg.bridgeUrl,
      orderId,
      printPath,
      source
    });

    const startTime = Date.now();
    try {
      const result = await printFn();
      const latencyMs = Date.now() - startTime;

      // LOG OBRIGATÓRIO: DEPOIS DA BRIDGE
      console.log("[PRINT_PIPELINE] RESPOSTA DA BRIDGE:", {
        orderId,
        ok: result.ok,
        error: result.error || null,
        latencyMs,
        printPath
      });
      auditTestLogger.logEvent("BRIDGE_RESPONSE", orderId, { ok: result.ok, error: result.error, latencyMs });
      return result;
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      console.log("[PRINT_PIPELINE] ERRO FATAL NA BRIDGE:", {
        orderId,
        ok: false,
        error: String(err),
        latencyMs,
        printPath
      });
      auditTestLogger.logEvent("BRIDGE_FATAL_ERROR", orderId, { error: String(err), latencyMs });
      return { ok: false, error: String(err) };
    }
  };

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

    const res = bridgeActuallyOnline ? await sendToBridge(() => printDelivery(input)) : { ok: false, error: "bridge_offline" };
    if (res.ok) return { ok: true, reason: "delivery_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: "delivery" };
    return { ok: false, reason: res.error || "bridge_failed", bridgeOk: false, queued: false, serviceType, layoutUsed: "delivery" };
  }

  const layoutKey = isPickup ? "pickup" : (mode === "delta" ? "dine_in_delta" : mode === "bill" ? "dine_in_bill" : "dine_in_full");
  
  if (mode === "delta") {
    if (deltaItems.length === 0)
      return { ok: false, reason: "no_delta", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_delta" };

    const res = bridgeActuallyOnline ? await sendToBridge(() => printDelta(tableValue, waiter, deltaItems, extras)) : { ok: false, error: "bridge_offline" };
    if (res.ok) return { ok: true, reason: "delta_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_delta" };
    return { ok: false, reason: res.error || "bridge_failed", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_delta" };
  }

  if (items.length === 0)
    return { ok: false, reason: "no_items", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_full" };

  if (mode === "bill") {
    const res = bridgeActuallyOnline ? await sendToBridge(() => printBill(tableValue, waiter, items as any[], order.total ?? 0, extras)) : { ok: false, error: "bridge_offline" };
    if (res.ok) return { ok: true, reason: "bill_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_bill" };
    return { ok: false, reason: res.error || "bridge_failed", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_bill" };
  }

  const res = bridgeActuallyOnline ? await sendToBridge(() => printReceipt(tableValue, waiter, items as any[], order.total ?? 0, extras)) : { ok: false, error: "bridge_offline" };
  if (res.ok) return { ok: true, reason: "full_ok", bridgeOk: true, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_full" };
  return { ok: false, reason: res.error || "bridge_failed", bridgeOk: false, queued: false, serviceType, layoutUsed: isPickup ? "pickup" : "dine_in_full" };
}
