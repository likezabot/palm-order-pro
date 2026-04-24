/**
 * Hook que mantém um mapa { orderId → últimoPrintJobStatus } em tempo real.
 *
 * A nova fonte de verdade para o badge visual de impressão é a tabela
 * `print_jobs`. Este hook escuta INSERT/UPDATE/DELETE e expõe um
 * lookup síncrono para os componentes que mostram badges no PDV.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { debugLog } from "@/lib/debug-logger";

export type PrintJobStatus = "queued" | "printing" | "printed" | "failed";

export interface PrintJobInfo {
  status: PrintJobStatus;
  jobType: string;
  updatedAt: string;
  lastError: string | null;
}

type Map = Record<string, PrintJobInfo>;

let globalMap: Map = {};
const listeners = new Set<(m: Map) => void>();

function setMap(updater: (prev: Map) => Map) {
  globalMap = updater(globalMap);
  listeners.forEach((l) => l(globalMap));
}

let initialized = false;
async function initialFetch() {
  if (initialized) return;
  initialized = true;
  try {
    // Pega o job mais recente por order_id (últimas 500 linhas — suficiente p/ UI)
    const { data, error } = await supabase
      .from("print_jobs")
      .select("order_id,status,job_type,updated_at,last_error")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const next: Map = {};
    for (const j of data ?? []) {
      const oid = (j as any).order_id as string;
      if (!next[oid]) {
        next[oid] = {
          status: (j as any).status,
          jobType: (j as any).job_type,
          updatedAt: (j as any).updated_at,
          lastError: (j as any).last_error ?? null,
        };
      }
    }
    setMap(() => next);
  } catch (e) {
    debugLog.warn("queue", "print-jobs initial fetch falhou", e);
  }
}

let channelStarted = false;
function startChannel() {
  if (channelStarted) return;
  channelStarted = true;
  const ch = supabase
    .channel(`print-jobs-ui-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "print_jobs" },
      (payload) => {
        const row: any = payload.new ?? payload.old;
        if (!row?.order_id) return;
        if (payload.eventType === "DELETE") {
          // não removemos do mapa; mantém último estado conhecido
          return;
        }
        setMap((prev) => {
          const existing = prev[row.order_id];
          // só sobrescreve se for mais recente
          if (existing && existing.updatedAt > row.updated_at) return prev;
          return {
            ...prev,
            [row.order_id]: {
              status: row.status,
              jobType: row.job_type,
              updatedAt: row.updated_at,
              lastError: row.last_error ?? null,
            },
          };
        });
      },
    )
    .subscribe();
  return ch;
}

export function usePrintJobsStatus() {
  const [map, setLocal] = useState<Map>(globalMap);

  useEffect(() => {
    listeners.add(setLocal);
    initialFetch();
    startChannel();
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  const get = useCallback((orderId: string | undefined | null): PrintJobInfo | null => {
    if (!orderId) return null;
    return map[orderId] ?? null;
  }, [map]);

  return { get, map };
}

/** Acesso síncrono fora do React (para componentes memoizados). */
export function getPrintJobInfo(orderId: string): PrintJobInfo | null {
  return globalMap[orderId] ?? null;
}
