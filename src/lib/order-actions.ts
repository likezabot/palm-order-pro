import { supabase } from "@/integrations/supabase/client";

/**
 * Cancela um pedido. Backend já trata limpeza de stats e notificações via trigger.
 * Se reason vier preenchido, salva em orders.rejected_reason.
 */
export async function cancelOrder(orderId: string, reason?: string) {
  const { error } = await supabase.rpc("update_order_status", {
    p_order_id: orderId,
    p_status: "cancelled",
    p_rejected_reason: reason?.trim() || null
  });
  if (error) throw error;
}
