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
import { checkBridgeStatus } from "@/lib/thermal-printer";
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

async function sendRawPayload(b64: string, bridgeUrl: string): Promise<boolean> {
  try {
    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: b64,
        format: "escpos",
        source: "Plano B Espetaria PDV (queue retry)",
        timestamp: new Date().toISOString(),
      }),
    });
    if (!response.ok) return false;
    const json = await response.json().catch(() => ({ success: false }));
    return !!json.success;
  } catch {
    return false;
  }
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
    if (!status.online || !status.printer_connected) {
      return { processed: 0, bridgeOnline: false };
    }

    let processed = 0;
    for (const job of queue) {
      if (processed >= MAX_PER_CYCLE) break;
      if (shouldDeferByBackoff(job)) continue;

      // Garante que o pedido ainda existe e está em estado que precisa de impressão
      const { data: order } = await supabase
        .from("orders")
        .select("print_status")
        .eq("id", job.orderId)
        .maybeSingle();

      if (!order) {
        // Pedido sumiu — descarta job
        await removePrintJob(job.id);
        processed++;
        continue;
      }

      const ok = await sendRawPayload(job.payloadB64, job.bridgeUrl);
      processed++;

      if (ok) {
        // Marca pedido como impresso (RPC existente, idempotente — só fecha
        // se estiver em 'printing'; se já estava 'printed' nada acontece)
        try {
          await supabase.rpc("complete_order_print", { p_order_id: job.orderId } as any);
        } catch (e) {
          console.warn("[print-queue-worker] complete_order_print falhou (não-crítico):", e);
        }
        await removePrintJob(job.id);
      } else {
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
    tickPrintQueue().catch((e) => console.warn("[print-queue-worker] tick error:", e));
  }, TICK_MS);
}

export function startPrintQueueWorker() {
  if (started) return;
  started = true;
  console.log("[print-queue-worker] Iniciado");

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
