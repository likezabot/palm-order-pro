/**
 * Reimpressão de senha do BALCÃO a partir de um pedido existente.
 * Recalcula a senha do dia (mesma lógica do create_order) e dispara printSenha com force=true.
 */

import { supabase } from "@/integrations/supabase/client";
import { printSenha } from "./print-receipt";
import { enqueuePrintJob } from "./print-jobs";

export interface ReprintResult {
  ok: boolean;
  reason?: string;
}

export async function reprintSenhaForOrder(orderId: string): Promise<ReprintResult> {
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, table_name, waiter_name, total, created_at, customer_name_snapshot")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return { ok: false, reason: "Pedido não encontrado." };
  }
  if (order.table_name !== "BALCÃO") {
    return { ok: false, reason: "Reimpressão de senha disponível apenas para BALCÃO." };
  }

  // Recalcula índice da senha (1-based) entre pedidos BALCÃO do mesmo dia.
  const created = new Date(order.created_at);
  const dayStart = new Date(created);
  dayStart.setHours(0, 0, 0, 0);

  const { data: dayOrders } = await supabase
    .from("orders")
    .select("id, created_at")
    .eq("table_name", "BALCÃO")
    .gte("created_at", dayStart.toISOString())
    .order("created_at", { ascending: true });

  const idx = (dayOrders || []).findIndex((o) => o.id === orderId);
  const senha = `#${(idx >= 0 ? idx + 1 : 1).toString().padStart(3, "0")}`;

  const { data: items } = await supabase
    .from("order_items")
    .select("product_name, quantity, product_price")
    .eq("order_id", orderId);

  const printItems = (items || []).map((i) => ({
    product_name: i.product_name,
    quantity: i.quantity,
    product_price: i.product_price,
  }));

  const customerName = (order as any).customer_name_snapshot?.trim() || undefined;

  const ok = await printSenha(senha, printItems, {
    waiterName: order.waiter_name || undefined,
    orderId: order.id,
    customerName,
    total: Number(order.total) || 0,
    force: true,
    source: "reprint",
  });

  // Enfileira para o .exe com job_type customer_receipt (não bloqueia)
  await enqueuePrintJob(order.id, "customer_receipt", {
    senha,
    customerName: customerName || null,
    kind: "customer_receipt",
  });

  return { ok, reason: ok ? undefined : "Impressora indisponível ou modo browser." };
}
