/**
 * Serviço centralizado de impressão — Plano B Espetaria
 * 
 * Usa RPCs seguras para claim/complete/fail de impressão.
 * Nunca marca como impresso antes do sucesso real.
 */

import { supabase } from "@/integrations/supabase/client";
import { printReceipt, printDelta, printBill, printDelivery } from "@/lib/print-receipt";
import { formatPrintTableValue } from "@/lib/utils";
import { loadPrintConfig } from "@/lib/print-config";
import {
  buildEscPosReceipt,
  buildEscPosDelta,
  buildEscPosBill,
  buildEscPosDelivery,
  type DeliveryPayloadInput,
} from "@/lib/thermal-printer";
import { encodePayloadB64, enqueuePrintJob, type PrintJobType } from "@/lib/print-queue";
import { debugLog } from "@/lib/debug-logger";

/**
 * Quando o bridge falha, enfileira o payload ESC/POS para retry posterior.
 * No-op se config não estiver em modo bridge (no browser não há fallback).
 * Idempotente por (orderId, printType).
 */
async function enqueueOnBridgeFailure(
  orderId: string,
  tableName: string,
  printType: PrintJobType,
  payload: Uint8Array,
): Promise<void> {
  try {
    const cfg = loadPrintConfig();
    if (cfg.printMode !== "bridge" || !cfg.bridgeUrl) return;
    await enqueuePrintJob({
      orderId,
      tableName,
      printType,
      payloadB64: encodePayloadB64(payload),
      bridgeUrl: cfg.bridgeUrl,
      lastError: "bridge_offline",
    });
    debugLog.warn("queue", `enfileirado (${printType}) — mesa ${tableName}, pedido ${orderId}`);
  } catch (e) {
    debugLog.error("queue", `falha ao enfileirar job (${printType})`, e);
  }
}

interface PrintableItem {
  product_name: string;
  quantity: number;
  product_price: number;
  note?: string | null;
}

/**
 * Valida campos essenciais de um pedido DELIVERY antes de imprimir.
 * Retorna array de campos faltantes (vazio = OK).
 *
 * Uso:
 *   const missing = validateDeliveryFields(deliveryInput);
 *   if (missing.length > 0) {
 *     // Mostrar aviso na UI e pedir confirmação manual antes de imprimir
 *   }
 */
export function validateDeliveryFields(input: {
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: { street?: string | null; number?: string | null; neighborhood?: string | null } | null;
  paymentMethod?: string | null;
}): string[] {
  const missing: string[] = [];
  const isBlank = (v: string | null | undefined): boolean => {
    if (v == null) return true;
    const s = String(v).trim();
    return !s || /^(n\/?a|undefined|null|---)$/i.test(s);
  };
  if (isBlank(input.customerName)) missing.push("nome do cliente");
  if (isBlank(input.customerPhone)) missing.push("telefone");
  if (!input.deliveryAddress || isBlank(input.deliveryAddress.street)) missing.push("endereço");
  if (!input.deliveryAddress || isBlank(input.deliveryAddress.neighborhood)) missing.push("bairro");
  if (isBlank(input.paymentMethod)) missing.push("forma de pagamento");
  return missing;
}

/**
 * Tenta "clamar" o pedido para impressão via RPC atômica.
 */
export async function claimOrderForPrint(orderId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_order_print", {
    p_order_id: orderId,
  } as any);

  if (error) {
    console.error("[print-service] Erro ao clamar pedido:", error);
    return false;
  }

  return !!data;
}

/**
 * Marca impressão como concluída com sucesso.
 */
async function completePrint(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("complete_order_print", {
    p_order_id: orderId,
  } as any);
  if (error) console.error("[print-service] Erro ao completar print:", error);
}

/**
 * Marca impressão como falha, permitindo retry.
 */
async function failPrint(orderId: string, errorMsg?: string): Promise<void> {
  const { error } = await supabase.rpc("fail_order_print", {
    p_order_id: orderId,
    p_error: errorMsg || null,
  } as any);
  if (error) console.error("[print-service] Erro ao registrar falha:", error);
}

/**
 * Adia a impressão: o job já foi enfileirado localmente (IndexedDB) e o worker
 * `print-queue-worker` cuidará de reimprimir quando a ponte voltar.
 * Marca o pedido como `queued` SEM atualizar `updated_at` para não disparar
 * loop de re-impressão pelo realtime.
 */
async function deferPrint(orderId: string): Promise<void> {
  const { error } = await supabase.rpc("defer_order_print", {
    p_order_id: orderId,
  } as any);
  if (error) console.error("[print-service] Erro ao adiar print:", error);
}

export async function isOrderPrinted(orderId: string): Promise<boolean> {
  const { data } = await supabase
    .from("orders")
    .select("print_status")
    .eq("id", orderId)
    .single();

  return (data as any)?.print_status === "printed";
}

/**
 * Impressão automática para pedidos NOVOS — sempre comanda completa.
 */
export async function autoPrintOrder(order: {
  id: string;
  table_name: string;
  original_table_name?: string | null;
  waiter_name: string | null;
  total: number | null;
}): Promise<{ printed: boolean; reason: string }> {
  debugLog.info("print", `autoPrintOrder iniciado — pedido ${order.id} mesa ${order.table_name}`);

  const claimed = await claimOrderForPrint(order.id);
  if (!claimed) return { printed: false, reason: "already_claimed" };

  // Busca metadados extras (service_type, delivery_*, customer_*)
  let originalName = order.original_table_name;
  let serviceType: string | null = null;
  let deliveryAddress: any = null;
  let deliveryFee = 0;
  let customerName: string | null = null;
  let customerPhone: string | null = null;
  let paymentMethod: string | null = null;
  let changeFor: number | null = null;
  try {
    const { data } = await supabase
      .from("orders")
      .select(
        "original_table_name, service_type, delivery_address, delivery_fee, customer_name_snapshot, customer_phone_snapshot, payment_method, change_for",
      )
      .eq("id", order.id)
      .single();
    const d = (data as any) ?? {};
    if (originalName === undefined) originalName = d.original_table_name ?? null;
    serviceType = d.service_type ?? null;
    deliveryAddress = d.delivery_address ?? null;
    deliveryFee = Number(d.delivery_fee ?? 0);
    customerName = d.customer_name_snapshot ?? null;
    customerPhone = d.customer_phone_snapshot ?? null;
    paymentMethod = d.payment_method ?? null;
    changeFor = d.change_for != null ? Number(d.change_for) : null;
  } catch {
    /* segue com defaults */
  }
  const tableValue = formatPrintTableValue(order.table_name, originalName);

  let items: PrintableItem[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);
    if (data && data.length > 0) { items = data; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (items.length === 0) {
    await failPrint(order.id, "no_items_found");
    return { printed: false, reason: "no_items" };
  }

  const cfg = loadPrintConfig();
  const isDelivery = serviceType === "delivery";

  // ---------- Fluxo DELIVERY (modelo dedicado) ----------
  if (isDelivery) {
    const subtotal = items.reduce(
      (s, i) => s + Number(i.product_price) * Number(i.quantity),
      0,
    );
    const deliveryInput: DeliveryPayloadInput = {
      items,
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryFee,
      subtotal,
      total: order.total ?? subtotal + deliveryFee,
      paymentMethod,
      changeFor,
      orderId: order.id,
      orderShortId: order.table_name?.replace(/^.*#/, "") || null,
      serviceType: "delivery",
    };

    // Aviso (não bloqueante) sobre dados faltantes — UI pode usar validateDeliveryFields
    // para bloquear/confirmar antes de impressão MANUAL.
    const missing = validateDeliveryFields(deliveryInput);
    if (missing.length > 0) {
      debugLog.warn(
        "print",
        `DELIVERY ${order.id} com dados faltantes: ${missing.join(", ")} — imprimindo mesmo assim (auto)`,
      );
    }

    const success = await printDelivery(deliveryInput);
    if (success) {
      await completePrint(order.id);
      return { printed: true, reason: "success_delivery" };
    }
    const payload = buildEscPosDelivery(deliveryInput, cfg);
    await enqueueOnBridgeFailure(order.id, tableValue, "full", payload);
    await deferPrint(order.id);
    return { printed: false, reason: "bridge_offline_queued" };
  }

  // ---------- Fluxo MESA / BALCÃO / RETIRADA (legado) ----------
  const extras = {
    serviceType: serviceType ?? undefined,
    customerName: customerName ?? undefined,
    customerPhone: customerPhone ?? undefined,
  };
  const success = await printReceipt(
    tableValue,
    order.waiter_name || "",
    items,
    order.total || 0,
    extras,
  );

  if (success) {
    await completePrint(order.id);
    return { printed: true, reason: "success" };
  } else {
    const payload = buildEscPosReceipt(
      tableValue,
      order.waiter_name || "",
      items,
      order.total || 0,
      cfg,
      extras,
    );
    await enqueueOnBridgeFailure(order.id, tableValue, "full", payload);
    await deferPrint(order.id);
    return { printed: false, reason: "bridge_offline_queued" };
  }
}

/**
 * Impressão automática de UPDATE — usa print_type do banco.
 */
export async function autoPrintUpdate(order: {
  id: string;
  table_name: string;
  original_table_name?: string | null;
  waiter_name: string | null;
  total: number | null;
}): Promise<{ printed: boolean; reason: string }> {
  debugLog.info("print", `autoPrintUpdate iniciado — pedido ${order.id} mesa ${order.table_name}`);

  const claimed = await claimOrderForPrint(order.id);
  if (!claimed) return { printed: false, reason: "already_claimed" };

  const { data: orderData } = await supabase
    .from("orders")
    .select("delta_items, print_type, waiter_name, original_table_name")
    .eq("id", order.id)
    .single();

  const printType = (orderData as any)?.print_type as string | null;
  const deltaItems = (orderData as any)?.delta_items as PrintableItem[] | null;
  const originalName =
    order.original_table_name ?? (orderData as any)?.original_table_name ?? null;
  const tableValue = formatPrintTableValue(order.table_name, originalName);

  debugLog.info("print", `print_type=${printType ?? "(nulo)"} delta_items=${deltaItems?.length ?? 0}`);

  const fetchAllItems = async (): Promise<PrintableItem[]> => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data } = await supabase.from("order_items").select("*").eq("order_id", order.id);
      if (data && data.length > 0) return data;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return [];
  };

  let success = false;
  let reason = "unknown";
  let payloadForQueue: Uint8Array | null = null;
  let queueType: PrintJobType = "full";

  try {
    const cfg = loadPrintConfig();
    if (printType === "bill") {
      const items = await fetchAllItems();
      if (items.length === 0) { await failPrint(order.id, "no_items"); return { printed: false, reason: "no_items" }; }
      success = await printBill(tableValue, order.waiter_name || "", items, order.total || 0);
      reason = success ? "bill_success" : "print_failed";
      if (!success) { payloadForQueue = buildEscPosBill(tableValue, order.waiter_name || "", items, order.total || 0, cfg); queueType = "bill"; }
    } else if (printType === "full") {
      const items = await fetchAllItems();
      if (items.length === 0) { await failPrint(order.id, "no_items"); return { printed: false, reason: "no_items" }; }
      success = await printReceipt(tableValue, order.waiter_name || "", items, order.total || 0);
      reason = success ? "full_success" : "print_failed";
      if (!success) { payloadForQueue = buildEscPosReceipt(tableValue, order.waiter_name || "", items, order.total || 0, cfg); queueType = "full"; }
    } else if (printType === "extra") {
      if (!deltaItems || deltaItems.length === 0) {
        await failPrint(order.id, "no_delta_items");
        return { printed: false, reason: "no_delta" };
      }
      success = await printDelta(tableValue, order.waiter_name || "", deltaItems);
      reason = success ? "delta_success" : "print_failed";
      if (!success) { payloadForQueue = buildEscPosDelta(tableValue, order.waiter_name || "", deltaItems, cfg); queueType = "delta"; }
    } else {
      // Fallback legado
      if (deltaItems && deltaItems.length > 0) {
        success = await printDelta(tableValue, order.waiter_name || "", deltaItems);
        reason = success ? "delta_success" : "print_failed";
        if (!success) { payloadForQueue = buildEscPosDelta(tableValue, order.waiter_name || "", deltaItems, cfg); queueType = "delta"; }
      } else {
        const items = await fetchAllItems();
        if (items.length === 0) { await failPrint(order.id, "no_items"); return { printed: false, reason: "no_items" }; }
        success = await printReceipt(tableValue, order.waiter_name || "", items, order.total || 0);
        reason = success ? "full_fallback" : "print_failed";
        if (!success) { payloadForQueue = buildEscPosReceipt(tableValue, order.waiter_name || "", items, order.total || 0, cfg); queueType = "full"; }
      }
    }
  } catch (err) {
    await failPrint(order.id, String(err));
    return { printed: false, reason: "print_error" };
  }

  if (success) {
    await completePrint(order.id);
  } else {
    if (payloadForQueue) {
      await enqueueOnBridgeFailure(order.id, tableValue, queueType, payloadForQueue);
      await deferPrint(order.id);
      return { printed: false, reason: "bridge_offline_queued" };
    }
    await failPrint(order.id, reason);
  }

  return { printed: success, reason };
}

// Backward compat
export const autoPrintDelta = autoPrintUpdate;

/**
 * Resultado das impressões manuais.
 * - ok: true se ao menos uma das vias (bridge local OU central) foi acionada
 * - reason: código curto p/ UI exibir mensagem
 * - queued: true se foi enfileirado p/ Central
 * - bridgeOk: true se a bridge local respondeu OK
 */
export interface ManualPrintResult {
  ok: boolean;
  reason:
    | "success"
    | "queued_only"
    | "no_items"
    | "no_delta"
    | "bridge_failed"
    | "error";
  queued: boolean;
  bridgeOk: boolean;
}

/**
 * Sempre enfileira na Central (PrintStation) e em paralelo tenta imprimir
 * localmente via bridge. Não toca em print_status do pedido — é manual.
 */
async function enqueueAndPrint(
  orderId: string,
  tableValue: string,
  printType: PrintJobType,
  payload: Uint8Array,
  bridgeAttempt: () => Promise<boolean>,
): Promise<ManualPrintResult> {
  // 1. Sempre tenta enfileirar na Central (se modo bridge)
  let queued = false;
  try {
    const cfg = loadPrintConfig();
    if (cfg.printMode === "bridge" && cfg.bridgeUrl) {
      await enqueuePrintJob({
        orderId,
        tableName: tableValue,
        printType,
        payloadB64: encodePayloadB64(payload),
        bridgeUrl: cfg.bridgeUrl,
        lastError: null,
      });
      queued = true;
    }
  } catch (e) {
    debugLog.error("queue", "falha ao enfileirar manual", e);
  }

  // 2. Tenta bridge local
  let bridgeOk = false;
  try {
    bridgeOk = await bridgeAttempt();
  } catch (e) {
    debugLog.error("print", "manual bridge erro", e);
  }

  if (bridgeOk) return { ok: true, reason: "success", queued, bridgeOk: true };
  if (queued) return { ok: true, reason: "queued_only", queued: true, bridgeOk: false };
  return { ok: false, reason: "bridge_failed", queued: false, bridgeOk: false };
}

/**
 * Reimpressão manual — comanda completa.
 */
export async function manualPrintOrder(order: {
  id: string;
  table_name: string;
  original_table_name?: string | null;
  waiter_name: string | null;
  total: number | null;
}): Promise<ManualPrintResult> {
  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  if (!items || items.length === 0)
    return { ok: false, reason: "no_items", queued: false, bridgeOk: false };

  const tableValue = formatPrintTableValue(order.table_name, order.original_table_name);
  const cfg = loadPrintConfig();
  const payload = buildEscPosReceipt(
    tableValue,
    order.waiter_name || "",
    items as any[],
    order.total || 0,
    cfg,
  );
  return enqueueAndPrint(order.id, tableValue, "full", payload, () =>
    printReceipt(tableValue, order.waiter_name || "", items as any[], order.total || 0),
  );
}

export async function manualPrintDelta(order: {
  id: string;
  table_name: string;
  original_table_name?: string | null;
  waiter_name: string | null;
}): Promise<ManualPrintResult> {
  const { data } = await supabase
    .from("orders")
    .select("delta_items")
    .eq("id", order.id)
    .single();

  const deltaItems = (data as any)?.delta_items as PrintableItem[] | null;
  if (!deltaItems || deltaItems.length === 0)
    return { ok: false, reason: "no_delta", queued: false, bridgeOk: false };

  const tableValue = formatPrintTableValue(order.table_name, order.original_table_name);
  const cfg = loadPrintConfig();
  const payload = buildEscPosDelta(tableValue, order.waiter_name || "", deltaItems, cfg);
  return enqueueAndPrint(order.id, tableValue, "delta", payload, () =>
    printDelta(tableValue, order.waiter_name || "", deltaItems),
  );
}

export async function manualPrintBill(order: {
  id: string;
  table_name: string;
  original_table_name?: string | null;
  waiter_name: string | null;
  total: number | null;
}): Promise<ManualPrintResult> {
  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  if (!items || items.length === 0)
    return { ok: false, reason: "no_items", queued: false, bridgeOk: false };

  const tableValue = formatPrintTableValue(order.table_name, order.original_table_name);
  const cfg = loadPrintConfig();
  const payload = buildEscPosBill(
    tableValue,
    order.waiter_name || "",
    items as any[],
    order.total || 0,
    cfg,
  );
  return enqueueAndPrint(order.id, tableValue, "bill", payload, () =>
    printBill(tableValue, order.waiter_name || "", items as any[], order.total || 0),
  );
}
