/**
 * Worker singleton que processa a fila local de impressão.
 *
 * Roda em qualquer aba aberta. Usa BroadcastChannel para sincronizar
 * (a UI escuta os eventos para atualizar status em tempo real).
 *
 * NÃO toca no bridge `.exe`: apenas reenvia payloads ESC/POS já prontos
 * para o mesmo endpoint POST /print que o pipeline normal usa.
 */

import { supabase } from "@/integrations/supabase/client";
import { checkBridgeStatus, sendToBridge } from "@/lib/thermal-printer";
import {
  decodePayloadB64,
  getPrintQueue,
  incrementAttempts,
  removePrintJob,
  subscribePrintQueue,
  type PrintJob,
} from "@/lib/print-queue";
import { debugLog } from "@/lib/debug-logger";

const TICK_MS = 15_000;
const MAX_PER_CYCLE = 3;
const BACKOFF_AFTER_ATTEMPTS = 3;
const BACKOFF_MS = 60_000;

let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Envia o payload já serializado da fila e registra origem como "queue".
 *
 * Importante: o payload base64 foi gerado quando o pedido foi enfileirado;
 * NÃO conseguimos injetar fingerprint dentro dele aqui. Mas o tracker de
 * origem registra orderId/serviceType/printPath para a UI mostrar a fonte.
 */
async function sendQueuedPayload(job: PrintJob, serviceType: string | null): Promise<boolean> {
  const payload = decodePayloadB64(job.payloadB64);
  const result = await sendToBridge(payload, job.bridgeUrl, {
    printPath: `queue.retry.${job.printType}`,
    source: "queue",
    orderId: job.orderId,
    serviceType,
    tableName: job.tableName ?? null,
  });
  return result.success;
}

function shouldDeferByBackoff(job: PrintJob): boolean {
  if (job.attempts < BACKOFF_AFTER_ATTEMPTS) return false;
  if (!job.lastAttemptAt) return false;
  return Date.now() - job.lastAttemptAt < BACKOFF_MS;
}

export async function tickPrintQueue(): Promise<{ processed: number; bridgeOnline: boolean }> {
  debugLog.warn("queue", "worker automático desativado no modo conservador; use reimpressão manual");
  return { processed: 0, bridgeOnline: false };
}

function scheduleTick() {
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    tickPrintQueue().catch((e) => debugLog.warn("queue", "tick error", e));
  }, TICK_MS);
}

export function startPrintQueueWorker() {
  if (started) return;
  started = true;
  debugLog.warn("queue", "worker automático pausado no modo conservador");
}
