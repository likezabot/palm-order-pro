import { supabase } from "@/integrations/supabase/client";

/**
 * Cancela um pedido. Backend já trata limpeza de stats e notificações via trigger.
 * Se reason vier preenchido, salva em orders.rejected_reason.
 */
export async function cancelOrder(orderId: string, reason?: string) {
  const { error } = await supabase.rpc("update_order_status", {
    p_order_id: orderId,
    p_status: "cancelled",
  });
  if (error) throw error;

  if (reason && reason.trim()) {
    await supabase
      .from("orders")
      .update({ rejected_reason: reason.trim() })
      .eq("id", orderId);
  }
}
