/**
 * Fila explícita de comandos de impressão (tabela print_jobs).
 *
 * Ao invés de inferir impressão a partir do estado do pedido,
 * o frontend cria EXPLICITAMENTE um comando de impressão sempre
 * que o usuário escolhe imprimir. O desktop (.exe) consome esses
 * comandos.
 *
 * Regras:
 * - Pedido novo + "Enviar e imprimir"  → job_type = "order"
 * - Acréscimo + "Enviar e imprimir"    → job_type = "extra"
 * - Conta (CloseOrder)                 → job_type = "bill"
 * - Reimpressão manual                 → job_type = "manual"
 * - "Enviar sem imprimir"              → NÃO enfileira nada
 */

import { supabase } from "@/integrations/supabase/client";
import { debugLog } from "@/lib/debug-logger";

export type PrintJobType = "order" | "extra" | "bill" | "manual";

export async function enqueuePrintJob(
  orderId: string,
  jobType: PrintJobType,
  payload?: Record<string, unknown> | null,
): Promise<string | null> {
  if (!orderId) return null;
  try {
    const { data, error } = await supabase.rpc("enqueue_print_job" as any, {
      p_order_id: orderId,
      p_job_type: jobType,
      p_payload: payload ?? null,
    });
    if (error) {
      debugLog.warn("print-jobs", `enqueue ${jobType} falhou`, error);
      return null;
    }
    debugLog.success("print-jobs", `enqueue ${jobType} ok pedido ${orderId}`);
    return (data as string) ?? null;
  } catch (e) {
    debugLog.warn("print-jobs", `enqueue ${jobType} exceção`, e);
    return null;
  }
}
