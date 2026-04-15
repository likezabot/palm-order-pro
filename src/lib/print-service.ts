/**
 * Serviço centralizado de impressão — Plano B Espetaria
 * 
 * Responsabilidades:
 * - Controle de idempotência (cada pedido imprime no máximo 1x automaticamente)
 * - Claim via Supabase (campo printed_at) para evitar duplicidade entre abas
 * - Separação entre autoimpressão (PrintStation) e reimpressão manual (PDV)
 * - Usa print_type do pedido para decidir layout: extra | full | bill
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
 * Tenta "clamar" o pedido para impressão automática.
 */
export async function claimOrderForPrint(orderId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("orders")
    .update({ printed_at: new Date().toISOString() } as any)
    .eq("id", orderId)
    .is("printed_at", null)
    .select("id");

  if (error) {
    console.error("[print-service] Erro ao clamar pedido:", error);
    return false;
  }

  return (data && data.length > 0) || false;
}

export async function isOrderPrinted(orderId: string): Promise<boolean> {
  const { data } = await supabase
    .from("orders")
    .select("printed_at")
    .eq("id", orderId)
    .single();

  return !!(data as any)?.printed_at;
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
  if (!claimed) return { printed: false, reason: "already_printed" };

  let items: PrintableItem[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);
    if (data && data.length > 0) { items = data; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (items.length === 0) return { printed: false, reason: "no_items" };

  const success = await printReceipt(
    order.table_name,
    order.waiter_name || "N/A",
    items,
    order.total || 0
  );

  return success ? { printed: true, reason: "success" } : { printed: false, reason: "print_failed" };
}

/**
 * Impressão automática de UPDATE — usa print_type do banco.
 * - "extra" → imprime apenas delta_items
 * - "full"  → imprime comanda completa
 * - "bill"  → imprime conta
 * - null/fallback legado → imprime delta se existir, senão completo
 */
export async function autoPrintUpdate(order: {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number | null;
}): Promise<{ printed: boolean; reason: string }> {
  console.log(`[print-service] AutoPrintUpdate: Pedido ${order.id} Mesa ${order.table_name}`);

  const claimed = await claimOrderForPrint(order.id);
  if (!claimed) return { printed: false, reason: "already_printed" };

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

  if (printType === "bill") {
    const items = await fetchAllItems();
    if (items.length === 0) return { printed: false, reason: "no_items" };
    success = await printBill(order.table_name, order.waiter_name || "N/A", items, order.total || 0);
    return success ? { printed: true, reason: "bill_success" } : { printed: false, reason: "print_failed" };
  }

  if (printType === "full") {
    const items = await fetchAllItems();
    if (items.length === 0) return { printed: false, reason: "no_items" };
    success = await printReceipt(order.table_name, order.waiter_name || "N/A", items, order.total || 0);
    return success ? { printed: true, reason: "full_success" } : { printed: false, reason: "print_failed" };
  }

  if (printType === "extra") {
    if (!deltaItems || deltaItems.length === 0) {
      return { printed: false, reason: "no_delta" };
    }
    success = await printDelta(order.table_name, order.waiter_name || "N/A", deltaItems);
    return success ? { printed: true, reason: "delta_success" } : { printed: false, reason: "print_failed" };
  }

  if (deltaItems && deltaItems.length > 0) {
    success = await printDelta(order.table_name, order.waiter_name || "N/A", deltaItems);
    return success ? { printed: true, reason: "delta_success" } : { printed: false, reason: "print_failed" };
  }

  const items = await fetchAllItems();
  if (items.length === 0) return { printed: false, reason: "no_items" };
  success = await printReceipt(order.table_name, order.waiter_name || "N/A", items, order.total || 0);
  return success ? { printed: true, reason: "full_fallback" } : { printed: false, reason: "print_failed" };
}

// Keep old name for backward compat
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
