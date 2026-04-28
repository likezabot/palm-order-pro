/**
 * Worker singleton que processa a fila local de impressão.
 *
 * Roda em qualquer aba aberta. Usa BroadcastChannel para sincronizar
 * (a UI escuta os eventos para atualizar status em tempo real).
 *
 * NÃO toca no bridge `.exe`: apenas reenvia payloads ESC/POS já prontos
 * para o mesmo endpoint POST /print que o pipeline normal usa.
 */

import { debugLog } from "@/lib/debug-logger";

let started = false;

export async function tickPrintQueue(): Promise<{ processed: number; bridgeOnline: boolean }> {
  debugLog.warn("queue", "worker automático desativado no modo conservador; use reimpressão manual");
  return { processed: 0, bridgeOnline: false };
}

export function startPrintQueueWorker() {
  if (started) return;
  started = true;
  debugLog.warn("queue", "worker automático pausado no modo conservador");
}
