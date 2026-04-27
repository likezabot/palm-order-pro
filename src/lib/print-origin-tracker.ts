/**
 * Rastreia a última impressão REAL (sendToBridge) feita por ESTA instância.
 *
 * Se o papel sai mas este tracker não registra nada, então outra
 * instância (EXE/PWA/aba antiga) está imprimindo — não é esta.
 */

import { APP_BUILD, PRINT_ENGINE_VERSION } from "./print-engine";

export interface PrintOriginRecord {
  ts: number;                              // Date.now()
  printPath: string;                       // ex.: "dispatcher.delivery"
  source: "auto" | "manual" | "reprint" | "queue" | "test" | "unknown";
  orderId?: string | null;
  serviceType?: string | null;
  tableName?: string | null;
  bridgeUrl?: string | null;
  bytes?: number | null;
  ok: boolean;
  errorMsg?: string | null;
  appBuild: string;
  engineVersion: string;
}

const MAX = 20;
let records: PrintOriginRecord[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    try { l(); } catch {}
  }
}

export function recordPrintOrigin(rec: Omit<PrintOriginRecord, "ts" | "appBuild" | "engineVersion">) {
  const full: PrintOriginRecord = {
    ...rec,
    ts: Date.now(),
    appBuild: APP_BUILD,
    engineVersion: PRINT_ENGINE_VERSION,
  };
  records = [full, ...records].slice(0, MAX);
  emit();
}

export function getPrintOriginRecords(): PrintOriginRecord[] {
  return records.slice();
}

export function getLastPrintOrigin(): PrintOriginRecord | null {
  return records[0] ?? null;
}

export function subscribePrintOrigin(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
