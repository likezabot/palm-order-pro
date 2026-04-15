/**
 * Serviço centralizado de impressão — Plano B Espetaria
 * 
 * Responsabilidades:
 * - Controle de idempotência (cada pedido imprime no máximo 1x automaticamente)
 * - Claim via Supabase (campo printed_at) para evitar duplicidade entre abas
 * - Separação entre autoimpressão (PrintStation) e reimpressão manual (PDV)
 * - Impressão de delta (acréscimo) quando pedido é atualizado
 */

import { supabase } from "@/integrations/supabase/client";
import { printReceipt, printDelta } from "@/lib/print-receipt";

interface PrintableItem {
  product_name: string;
  quantity: number;
  product_price: number;
  note?: string | null;
}

/**
 * Tenta "clamar" o pedido para impressão automática.
 * Usa UPDATE condicional: só marca printed_at se ainda for NULL.
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

/**
 * Verifica se um pedido já foi impresso.
 */
export async function isOrderPrinted(orderId: string): Promise<boolean> {
  const { data } = await supabase
    .from("orders")
    .select("printed_at")
    .eq("id", orderId)
    .single();

  return !!(data as any)?.printed_at;
}

/**
 * Impressão automática com idempotência.
 * Para pedidos NOVOS: imprime comanda completa.
 */
export async function autoPrintOrder(order: {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number | null;
}): Promise<{ printed: boolean; reason: string }> {
  console.log(`[print-service] AutoPrint: Recebido pedido ${order.id} para Mesa ${order.table_name}`);

  const claimed = await claimOrderForPrint(order.id);
  if (!claimed) {
    console.log(`[print-service] AutoPrint: Pedido ${order.id} já foi clamo por outra instância`);
    return { printed: false, reason: "already_printed" };
  }

  let items: PrintableItem[] = [];
  console.log(`[print-service] AutoPrint: Buscando itens para pedido ${order.id}...`);
  
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);

    if (error) {
      console.error(`[print-service] Erro ao buscar itens (tentativa ${attempt + 1}):`, error);
    }

    if (data && data.length > 0) {
      items = data;
      console.log(`[print-service] AutoPrint: Encontrados ${items.length} itens na tentativa ${attempt + 1}`);
      break;
    }
    
    console.log(`[print-service] AutoPrint: Itens não encontrados na tentativa ${attempt + 1}/6, aguardando...`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (items.length === 0) {
    console.error(`[print-service] ERRO: Pedido ${order.id} sem itens após retries. Abortando impressão.`);
    return { printed: false, reason: "no_items" };
  }

  console.log(`[print-service] AutoPrint: Disparando impressão final para Mesa ${order.table_name}`);
  const success = await printReceipt(
    order.table_name,
    order.waiter_name || "N/A",
    items,
    order.total || 0
  );

  if (!success) {
    console.error("[print-service] Falha na impressão automática.");
    return { printed: false, reason: "print_failed" };
  }

  return { printed: true, reason: "success" };
}

/**
 * Impressão automática de DELTA (acréscimo).
 * Para pedidos ATUALIZADOS com delta_items.
 */
export async function autoPrintDelta(order: {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number | null;
}): Promise<{ printed: boolean; reason: string }> {
  console.log(`[print-service] AutoPrintDelta: Pedido ${order.id} Mesa ${order.table_name}`);

  const claimed = await claimOrderForPrint(order.id);
  if (!claimed) {
    return { printed: false, reason: "already_printed" };
  }

  // Buscar delta_items do pedido
  const { data: orderData } = await supabase
    .from("orders")
    .select("delta_items, waiter_name")
    .eq("id", order.id)
    .single();

  const deltaItems = (orderData as any)?.delta_items as PrintableItem[] | null;

  if (deltaItems && deltaItems.length > 0) {
    console.log(`[print-service] AutoPrintDelta: ${deltaItems.length} itens de acréscimo`);
    const success = await printDelta(
      order.table_name,
      order.waiter_name || "N/A",
      deltaItems
    );
    if (!success) return { printed: false, reason: "print_failed" };
    return { printed: true, reason: "delta_success" };
  }

  // Fallback: sem delta, imprimir completo
  console.log(`[print-service] AutoPrintDelta: Sem delta, imprimindo completo como fallback`);
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
  return success ? { printed: true, reason: "full_fallback" } : { printed: false, reason: "print_failed" };
}

/**
 * Reimpressão manual — não verifica claim, sempre imprime.
 */
export async function manualPrintOrder(order: {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number | null;
}): Promise<boolean> {
  console.log(`[print-service] ManualPrint: Recebido pedido ${order.id} para Mesa ${order.table_name}`);

  const { data: items, error } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  if (error) {
    console.error(`[print-service] ManualPrint: Erro ao buscar itens:`, error);
  }

  if (!items || items.length === 0) {
    console.error(`[print-service] ManualPrint: Pedido ${order.id} sem itens encontrados. Abortando.`);
    return false;
  }

  console.log(`[print-service] ManualPrint: Imprimindo ${items.length} itens para Mesa ${order.table_name}`);
  const success = await printReceipt(
    order.table_name,
    order.waiter_name || "N/A",
    items as any[],
    order.total || 0
  );

  return success;
}

/**
 * Impressão manual de delta — busca delta_items do banco.
 */
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

/**
 * Impressão manual de conta.
 */
export async function manualPrintBill(order: {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number | null;
}): Promise<boolean> {
  const { printBill } = await import("@/lib/print-receipt");
  
  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  if (!items || items.length === 0) return false;

  return await printBill(order.table_name, order.waiter_name || "N/A", items as any[], order.total || 0);
}
