/**
 * Monitor de conectividade — singleton iniciado uma vez no main.tsx.
 *
 * - Escuta eventos online/offline do navigator.
 * - Pinga internet a cada 30s (HEAD generate_204).
 * - Pinga backend a cada 60s (Supabase REST mínimo).
 * - Pausa quando aba escondida; retoma ao voltar.
 * - Verifica staleness do Realtime a cada 15s.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  reportInternet,
  reportBackend,
  checkRealtimeStaleness,
} from "./connectivity-store";
import { debugLog } from "./debug-logger";

let started = false;
let internetTimer: ReturnType<typeof setInterval> | null = null;
let backendTimer: ReturnType<typeof setInterval> | null = null;
let stalenessTimer: ReturnType<typeof setInterval> | null = null;

const INTERNET_INTERVAL = 30_000;
const BACKEND_INTERVAL = 60_000;
const STALENESS_INTERVAL = 15_000;
const PING_TIMEOUT = 3_500;

async function pingInternet(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT);
    // no-cors HEAD para evitar problemas de CORS; opaque response = sucesso de rede.
    await fetch("https://www.google.com/generate_204", {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

async function pingBackend(): Promise<boolean> {
  try {
    const t0 = performance.now();
    const { error } = await supabase
      .from("settings")
      .select("key")
      .limit(1);
    const ms = Math.round(performance.now() - t0);
    if (error) {
      debugLog.warn("system", `backend ping falhou em ${ms}ms`, error.message);
      return false;
    }
    debugLog.info("system", `backend ping OK em ${ms}ms`);
    return true;
  } catch (e) {
    debugLog.warn("system", "backend ping exceção", e);
    return false;
  }
}

async function runInternetCheck() {
  if (typeof document !== "undefined" && document.hidden) return;
  const ok = await pingInternet();
  reportInternet(ok);
}

async function runBackendCheck() {
  if (typeof document !== "undefined" && document.hidden) return;
  const ok = await pingBackend();
  reportBackend(ok);
}

export function startConnectivityMonitor() {
  if (started || typeof window === "undefined") return;
  started = true;

  debugLog.info("system", "connectivity monitor iniciado");

  // Estado inicial via navigator.onLine (best-effort).
  reportInternet(navigator.onLine);

  // Listeners do navegador.
  window.addEventListener("online", () => {
    debugLog.info("system", "evento window.online");
    runInternetCheck();
    runBackendCheck();
  });
  window.addEventListener("offline", () => {
    debugLog.warn("system", "evento window.offline");
    reportInternet(false);
  });

  // Primeira rodada imediata (assíncrona).
  runInternetCheck();
  runBackendCheck();

  internetTimer = setInterval(runInternetCheck, INTERNET_INTERVAL);
  backendTimer = setInterval(runBackendCheck, BACKEND_INTERVAL);
  stalenessTimer = setInterval(() => checkRealtimeStaleness(), STALENESS_INTERVAL);

  // Ao voltar de aba escondida, força um check.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      runInternetCheck();
      runBackendCheck();
    }
  });
}

export function stopConnectivityMonitor() {
  if (internetTimer) clearInterval(internetTimer);
  if (backendTimer) clearInterval(backendTimer);
  if (stalenessTimer) clearInterval(stalenessTimer);
  internetTimer = backendTimer = stalenessTimer = null;
  started = false;
}

/** Força um ping imediato (usado pelo botão "Reconectar agora"). */
export async function forceConnectivityCheck() {
  await Promise.all([runInternetCheck(), runBackendCheck()]);
}
