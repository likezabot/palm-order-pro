/**
 * Store global de conectividade (singleton com pub/sub).
 *
 * Não toca em backend nem em pipeline de impressão.
 * Apenas observa três sinais independentes:
 *   - internet  → navigator.onLine + ping externo (generate_204)
 *   - realtime  → status reportado pelos canais Supabase
 *   - backend   → ping leve à REST do Supabase
 */

import { debugLog } from "./debug-logger";

export type SignalState = "online" | "offline" | "degraded" | "unknown";

export interface ConnectivityState {
  internet: SignalState;
  realtime: SignalState;
  backend: SignalState;
  lastRealtimeHeartbeat: number;
  updatedAt: number;
}

type Listener = (s: ConnectivityState) => void;

const state: ConnectivityState = {
  internet: "unknown",
  realtime: "unknown",
  backend: "unknown",
  lastRealtimeHeartbeat: 0,
  updatedAt: Date.now(),
};

const listeners = new Set<Listener>();

function notify() {
  state.updatedAt = Date.now();
  listeners.forEach((fn) => {
    try { fn({ ...state }); } catch (e) { console.warn("[connectivity] listener err", e); }
  });
}

export function getConnectivity(): ConnectivityState {
  return { ...state };
}

export function subscribeConnectivity(fn: Listener): () => void {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export function reportInternet(ok: boolean) {
  const next: SignalState = ok ? "online" : "offline";
  if (state.internet === next) return;
  state.internet = next;
  debugLog[ok ? "success" : "warn"]("system", `internet → ${next}`);
  notify();
}

export function reportBackend(ok: boolean) {
  const next: SignalState = ok ? "online" : "offline";
  if (state.backend === next) return;
  state.backend = next;
  debugLog[ok ? "success" : "warn"]("system", `backend → ${next}`);
  notify();
}

/**
 * Reporta status do canal Realtime.
 * Aceita strings cruas do Supabase (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED)
 * ou estados normalizados.
 */
export function reportRealtime(rawStatus: string) {
  let next: SignalState;
  switch (rawStatus) {
    case "SUBSCRIBED":
    case "online":
      next = "online";
      state.lastRealtimeHeartbeat = Date.now();
      break;
    case "CHANNEL_ERROR":
    case "TIMED_OUT":
    case "offline":
      next = "offline";
      break;
    case "CLOSED":
    case "degraded":
      next = "degraded";
      break;
    default:
      next = "unknown";
  }
  if (state.realtime === next) return;
  state.realtime = next;
  debugLog[next === "online" ? "success" : "warn"]("realtime", `connectivity store → ${next} (raw=${rawStatus})`);
  notify();
}

export function markRealtimeHeartbeat() {
  state.lastRealtimeHeartbeat = Date.now();
}

/**
 * Detecta degradação por ausência de heartbeat.
 * Restaurante pode ficar parado, então usamos um threshold longo (10 min).
 */
export function checkRealtimeStaleness(thresholdMs = 600_000) {
  if (state.realtime !== "online") return;
  const since = Date.now() - state.lastRealtimeHeartbeat;
  if (since > thresholdMs) {
    state.realtime = "degraded";
    debugLog.warn("realtime", `sem heartbeat há ${Math.round(since / 1000)}s — marcando degraded`);
    notify();
  }
}
