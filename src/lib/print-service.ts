/**
 * Serviço centralizado de impressão — Plano B Espetaria
 * 
 * Usa RPCs seguras para claim/complete/fail de impressão.
 * Nunca marca como impresso antes do sucesso real.
 */

import { supabase } from "@/integrations/supabase/client";
import { debugLog } from "@/lib/debug-logger";
import { logPrinterEvent } from "@/lib/printer-logger";

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

export async function isOrderPrinted(orderId: string): Promise<boolean> {
  const { data } = await supabase
    .from("orders")
    .select("print_status")
    .eq("id", orderId)
    .single();

  return (data as any)?.print_status === "printed";
}

/**
 * NOVA ARQUITETURA — todas as funções abaixo delegam ao dispatcher único
 * `printOrderByServiceType`, que SEMPRE lê service_type do banco e escolhe
 * o layout correto (delivery / pickup / dine_in). Os wrappers existem só para
 * manter compatibilidade com os callsites antigos (PDV/Cashier/Admin/Palm).
 */
import { printOrderByServiceType, type DispatchMode } from "@/lib/print-dispatcher";

/** Impressão automática de pedidos NOVOS — sempre comanda completa. */
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

  try {
    const r = await printOrderByServiceType(order.id, "full", "auto");
    if (r.ok && r.bridgeOk) {
      await completePrint(order.id);
      return { printed: true, reason: r.reason };
    }
    await failPrint(order.id, r.reason);
    return { printed: false, reason: r.reason };
  } catch (err) {
    await failPrint(order.id, String(err));
    return { printed: false, reason: "print_error" };
  }
}

/** Impressão automática de UPDATE — usa print_type do banco para decidir delta/full/bill. */
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

  // Lê print_type só para escolher modo; o dispatcher relê tudo (incl. service_type).
  const { data: meta } = await supabase
    .from("orders")
    .select("print_type, delta_items")
    .eq("id", order.id)
    .single();
  const printType = (meta as any)?.print_type as string | null;
  const deltaItems = ((meta as any)?.delta_items ?? []) as any[];

  let mode: DispatchMode = "full";
  if (printType === "bill") mode = "bill";
  else if (printType === "extra") mode = "delta";
  else if (printType === "full") mode = "full";
  else if (deltaItems.length > 0) mode = "delta"; // fallback legado

  try {
    const r = await printOrderByServiceType(order.id, mode, "auto");
    if (r.ok && r.bridgeOk) {
      await completePrint(order.id);
      return { printed: true, reason: r.reason };
    }
    await failPrint(order.id, r.reason);
    return { printed: false, reason: r.reason };
  } catch (err) {
    await failPrint(order.id, String(err));
    return { printed: false, reason: "print_error" };
  }
}

// Backward compat
export const autoPrintDelta = autoPrintUpdate;

// ============================================================
// MANUAL PRINTS (não tocam em print_status)
// ============================================================

export interface ManualPrintResult {
  ok: boolean;
  reason: "success" | "queued_only" | "no_items" | "no_delta" | "bridge_failed" | "error";
  queued: boolean;
  bridgeOk: boolean;
  error?: string;
}

function toManual(r: Awaited<ReturnType<typeof printOrderByServiceType>>): ManualPrintResult {
  if (r.ok && r.bridgeOk)
    return { ok: true, reason: "success", queued: r.queued, bridgeOk: true };
  if (r.queued) return { ok: true, reason: "queued_only", queued: true, bridgeOk: false, error: r.reason };
  if (r.reason === "no_items") return { ok: false, reason: "no_items", queued: false, bridgeOk: false };
  if (r.reason === "no_delta") return { ok: false, reason: "no_delta", queued: false, bridgeOk: false };
  if (r.reason === "order_not_found") return { ok: false, reason: "error", queued: false, bridgeOk: false };
  return { ok: false, reason: "bridge_failed", queued: false, bridgeOk: false, error: r.reason };
}

export async function manualPrintOrder(order: {
  id: string;
  table_name?: string;
  original_table_name?: string | null;
  waiter_name?: string | null;
  total?: number | null;
}): Promise<ManualPrintResult> {
  // Mesmo em manual, tentamos "clamar" para evitar que o auto-print dispare em paralelo
  // ou para marcar que estamos tentando imprimir agora.
  await claimOrderForPrint(order.id);

  try {
    const r = await printOrderByServiceType(order.id, "full", "manual");
    if (r.ok && r.bridgeOk) {
      await completePrint(order.id);
      return { ok: true, reason: "success", queued: false, bridgeOk: true };
    }
    await failPrint(order.id, r.reason);
    return toManual(r);
  } catch (err) {
    await failPrint(order.id, String(err));
    return { ok: false, reason: "error", queued: false, bridgeOk: false, error: String(err) };
  }
}

export async function manualPrintDelta(order: {
  id: string;
  table_name?: string;
  original_table_name?: string | null;
  waiter_name?: string | null;
}): Promise<ManualPrintResult> {
  await claimOrderForPrint(order.id);
  try {
    const r = await printOrderByServiceType(order.id, "delta", "manual");
    if (r.ok && r.bridgeOk) {
      await completePrint(order.id);
      return { ok: true, reason: "success", queued: false, bridgeOk: true };
    }
    await failPrint(order.id, r.reason);
    return toManual(r);
  } catch (err) {
    await failPrint(order.id, String(err));
    return { ok: false, reason: "error", queued: false, bridgeOk: false, error: String(err) };
  }
}

export async function manualPrintBill(order: {
  id: string;
  table_name?: string;
  original_table_name?: string | null;
  waiter_name?: string | null;
  total?: number | null;
}): Promise<ManualPrintResult> {
  await claimOrderForPrint(order.id);
  try {
    const r = await printOrderByServiceType(order.id, "bill", "manual");
    if (r.ok && r.bridgeOk) {
      await completePrint(order.id);
      return { ok: true, reason: "success", queued: false, bridgeOk: true };
    }
    await failPrint(order.id, r.reason);
    return toManual(r);
  } catch (err) {
    await failPrint(order.id, String(err));
    return { ok: false, reason: "error", queued: false, bridgeOk: false, error: String(err) };
  }
}

/** Reimpressão explícita (ex.: botão "Imprimir novamente"). */
export async function reprintOrder(
  order: { id: string },
  mode: DispatchMode = "full",
): Promise<ManualPrintResult> {
  await claimOrderForPrint(order.id);
  try {
    const r = await printOrderByServiceType(order.id, mode, "reprint");
    if (r.ok && r.bridgeOk) {
      await completePrint(order.id);
      return { ok: true, reason: "success", queued: false, bridgeOk: true };
    }
    await failPrint(order.id, r.reason);
    return toManual(r);
  } catch (err) {
    await failPrint(order.id, String(err));
    return { ok: false, reason: "error", queued: false, bridgeOk: false, error: String(err) };
  }
}

