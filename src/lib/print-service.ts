/**
 * Serviço centralizado de impressão — Plano B Espetaria
 * 
 * Usa RPCs seguras para claim/complete/fail de impressão.
 * Nunca marca como impresso antes do sucesso real.
 */

import { supabase } from "@/integrations/supabase/client";
import { printReceipt, printDelta, printBill } from "@/lib/print-receipt";

interface PrintableItem {
  product_name: string;
  quantity: number;
  product_price: number;
  note?: string | null;
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
 * Impressão automática para pedidos NOVOS — sempre comanda completa.
 */
export async function autoPrintOrder(order: {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number | null;
}): Promise<{ printed: boolean; reason: string }> {
  console.log(`[print-service] AutoPrint: Pedido ${order.id} Mesa ${order.table_name}`);

  const claimed = await claimOrderForPrint(order.id);
  if (!claimed) return { printed: false, reason: "already_claimed" };

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

  const success = await printReceipt(
    order.table_name,
    order.waiter_name || "N/A",
    items,
    order.total || 0
  );

  if (success) {
    await completePrint(order.id);
    return { printed: true, reason: "success" };
  } else {
    await failPrint(order.id, "print_failed");
    return { printed: false, reason: "print_failed" };
  }
}

/**
 * Impressão automática de UPDATE — usa print_type do banco.
 */
export async function autoPrintUpdate(order: {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number | null;
}): Promise<{ printed: boolean; reason: string }> {
  console.log(`[print-service] AutoPrintUpdate: Pedido ${order.id} Mesa ${order.table_name}`);

  const claimed = await claimOrderForPrint(order.id);
  if (!claimed) return { printed: false, reason: "already_claimed" };

  const { data: orderData } = await supabase
    .from("orders")
    .select("delta_items, print_type, waiter_name")
    .eq("id", order.id)
    .single();

  const printType = (orderData as any)?.print_type as string | null;
  const deltaItems = (orderData as any)?.delta_items as PrintableItem[] | null;

  console.log(`[print-service] print_type=${printType}, delta_items=${deltaItems?.length ?? 0}`);

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

  try {
    if (printType === "bill") {
      const items = await fetchAllItems();
      if (items.length === 0) { await failPrint(order.id, "no_items"); return { printed: false, reason: "no_items" }; }
      success = await printBill(order.table_name, order.waiter_name || "N/A", items, order.total || 0);
      reason = success ? "bill_success" : "print_failed";
    } else if (printType === "full") {
      const items = await fetchAllItems();
      if (items.length === 0) { await failPrint(order.id, "no_items"); return { printed: false, reason: "no_items" }; }
      success = await printReceipt(order.table_name, order.waiter_name || "N/A", items, order.total || 0);
      reason = success ? "full_success" : "print_failed";
    } else if (printType === "extra") {
      if (!deltaItems || deltaItems.length === 0) {
        await failPrint(order.id, "no_delta_items");
        return { printed: false, reason: "no_delta" };
      }
      success = await printDelta(order.table_name, order.waiter_name || "N/A", deltaItems);
      reason = success ? "delta_success" : "print_failed";
    } else {
      // Fallback legado
      if (deltaItems && deltaItems.length > 0) {
        success = await printDelta(order.table_name, order.waiter_name || "N/A", deltaItems);
        reason = success ? "delta_success" : "print_failed";
      } else {
        const items = await fetchAllItems();
        if (items.length === 0) { await failPrint(order.id, "no_items"); return { printed: false, reason: "no_items" }; }
        success = await printReceipt(order.table_name, order.waiter_name || "N/A", items, order.total || 0);
        reason = success ? "full_fallback" : "print_failed";
      }
    }
  } catch (err) {
    await failPrint(order.id, String(err));
    return { printed: false, reason: "print_error" };
  }

  if (success) {
    await completePrint(order.id);
  } else {
    await failPrint(order.id, reason);
  }

  return { printed: success, reason };
}

// Backward compat
export const autoPrintDelta = autoPrintUpdate;

/**
 * Reimpressão manual — não verifica claim, sempre imprime.
 */
export async function manualPrintOrder(order: {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number | null;
}): Promise<boolean> {
  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  if (!items || items.length === 0) return false;

  return await printReceipt(order.table_name, order.waiter_name || "N/A", items as any[], order.total || 0);
}

export async function manualPrintDelta(order: {
  id: string;
  table_name: string;
  waiter_name: string | null;
}): Promise<boolean> {
  const { data } = await supabase
    .from("orders")
    .select("delta_items")
    .eq("id", order.id)
    .single();

  const deltaItems = (data as any)?.delta_items as PrintableItem[] | null;
  if (!deltaItems || deltaItems.length === 0) return false;

  return await printDelta(order.table_name, order.waiter_name || "N/A", deltaItems);
}

export async function manualPrintBill(order: {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number | null;
}): Promise<boolean> {
  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  if (!items || items.length === 0) return false;

  return await printBill(order.table_name, order.waiter_name || "N/A", items as any[], order.total || 0);
}
