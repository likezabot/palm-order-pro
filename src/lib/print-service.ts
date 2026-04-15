/**
 * Serviço centralizado de impressão — Plano B Espetaria
 * 
 * Responsabilidades:
 * - Controle de idempotência (cada pedido imprime no máximo 1x automaticamente)
 * - Claim via Supabase (campo printed_at) para evitar duplicidade entre abas
 * - Separação entre autoimpressão (PrintStation) e reimpressão manual (PDV)
 */

import { supabase } from "@/integrations/supabase/client";
import { printReceipt } from "@/lib/print-receipt";

interface PrintableItem {
  product_name: string;
  quantity: number;
  product_price: number;
  note?: string | null;
}

/**
 * Tenta "clamar" o pedido para impressão automática.
 * Usa UPDATE condicional: só marca printed_at se ainda for NULL.
 * Retorna true se este tab/instância ganhou o claim (pode imprimir).
 * Retorna false se outro tab já imprimiu.
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

  // Se retornou o registro, o claim foi bem-sucedido
  return (data && data.length > 0) || false;
}

/**
 * Verifica se um pedido já foi impresso (tem printed_at preenchido).
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
 * Só imprime se conseguir o claim no banco.
 * Busca os itens automaticamente.
 */
export async function autoPrintOrder(order: {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number | null;
}): Promise<{ printed: boolean; reason: string }> {
  console.log(`[print-service] AutoPrint: Recebido pedido ${order.id} para Mesa ${order.table_name}`);

  // 1. Tentar claim atômico
  const claimed = await claimOrderForPrint(order.id);
  if (!claimed) {
    console.log(`[print-service] AutoPrint: Pedido ${order.id} já foi clamo por outra instância`);
    return { printed: false, reason: "already_printed" };
  }

  // 2. Buscar itens com retry (podem demorar a chegar ao banco)
  let items: PrintableItem[] = [];
  console.log(`[print-service] AutoPrint: Buscando itens para pedido ${order.id}...`);
  
  for (let attempt = 0; attempt < 4; attempt++) {
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
    
    console.log(`[print-service] AutoPrint: Itens não encontrados na tentativa ${attempt + 1}, aguardando...`);
    // Esperar 800ms antes de tentar novamente (aumentado de 500ms)
    await new Promise((r) => setTimeout(r, 800));
  }

  if (items.length === 0) {
    console.error(`[print-service] ERRO: Pedido ${order.id} sem itens após retries. Abortando impressão.`);
    return { printed: false, reason: "no_items" };
  }

  // 3. Imprimir
  console.log(`[print-service] AutoPrint: Disparando impressão final para Mesa ${order.table_name}`);
  await printReceipt(
    order.table_name,
    order.waiter_name || "N/A",
    items,
    order.total || 0
  );

  return { printed: true, reason: "success" };
}

/**
 * Reimpressão manual — não verifica claim, sempre imprime.
 * Usado pelo PDV quando o operador clica "IMPRIMIR CUPOM".
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
  await printReceipt(
    order.table_name,
    order.waiter_name || "N/A",
    items,
    order.total || 0
  );

  return true;
}
