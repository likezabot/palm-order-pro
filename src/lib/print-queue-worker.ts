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
  if (running) return { processed: 0, bridgeOnline: false };
  running = true;

  try {
    const queue = (await getPrintQueue()).filter((j) => !j.dead);
    if (queue.length === 0) return { processed: 0, bridgeOnline: true };

    // Usa o bridgeUrl do primeiro job para o health check
    const sampleUrl = queue[0].bridgeUrl;
    const status = await checkBridgeStatus(sampleUrl);
    if (!status.online) {
      return { processed: 0, bridgeOnline: false };
    }

    let processed = 0;
    for (const job of queue) {
      if (processed >= MAX_PER_CYCLE) break;
      if (shouldDeferByBackoff(job)) continue;

      // Garante que o pedido ainda existe e tenta resgatar service_type
      const { data: order } = await supabase
        .from("orders")
        .select("print_status, service_type")
        .eq("id", job.orderId)
        .maybeSingle();

      if (!order) {
        // Pedido sumiu — descarta job
        await removePrintJob(job.id);
        processed++;
        continue;
      }

      const serviceType = (order as any)?.service_type ?? null;
      const ok = await sendQueuedPayload(job, serviceType);
      processed++;

      if (ok) {
        debugLog.success("queue", `retry ✓ pedido ${job.orderId} (${job.printType}) — tentativa ${job.attempts + 1}`);
        // Marca pedido como impresso (RPC existente, idempotente — só fecha
        // se estiver em 'printing'; se já estava 'printed' nada acontece)
        try {
          await supabase.rpc("complete_order_print", { p_order_id: job.orderId } as any);
        } catch (e) {
          debugLog.warn("queue", `complete_order_print falhou (não-crítico) pedido ${job.orderId}`, e);
        }
        await removePrintJob(job.id);
      } else {
        debugLog.warn("queue", `retry ✗ pedido ${job.orderId} (${job.printType}) — tentativa ${job.attempts + 1}`);
        await incrementAttempts(job.id, "retry_failed");
      }
    }

    return { processed, bridgeOnline: true };
  } finally {
    running = false;
  }
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
  debugLog.info("queue", "worker iniciado (tick a cada 15s)");

  // Tick rápido ao subir e quando a fila recebe novo job
  setTimeout(() => tickPrintQueue().catch(() => {}), 2000);

  subscribePrintQueue((msg) => {
    if (msg.kind === "enqueued") {
      // Pequeno delay para evitar tempestade
      setTimeout(() => tickPrintQueue().catch(() => {}), 1500);
    }
  });

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tickPrintQueue().catch(() => {});
    });
  }

  scheduleTick();
}
