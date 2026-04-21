/**
 * Logger central client-side para depuração rápida.
 *
 * - Imprime no console com prefixo padronizado e timestamp.
 * - Mantém um buffer circular em memória (últimos 500 eventos)
 *   acessível via `window.__plbLogs()` para download/cópia.
 * - Não envia nada para servidor. Não toca em backend.
 *
 * Categorias usadas no projeto:
 *   - "realtime"  → canais Supabase (subscribe, status, eventos)
 *   - "print"     → tentativas de impressão (sucesso/erro/latência)
 *   - "queue"     → fila local de retry (enqueue/attempt/remove/dead)
 *   - "bridge"    → health-check do bridge .exe
 */

export type DebugCategory = "realtime" | "print" | "queue" | "bridge" | "system";
export type DebugLevel = "info" | "warn" | "error" | "success";

export interface DebugLogEntry {
  ts: number;
  iso: string;
  category: DebugCategory;
  level: DebugLevel;
  message: string;
  data?: unknown;
}

const BUFFER_SIZE = 500;
const buffer: DebugLogEntry[] = [];

function push(entry: DebugLogEntry) {
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.splice(0, buffer.length - BUFFER_SIZE);
}

function fmt(category: DebugCategory, message: string) {
  return `[${category}] ${message}`;
}

function emit(level: DebugLevel, category: DebugCategory, message: string, data?: unknown) {
  const ts = Date.now();
  const entry: DebugLogEntry = {
    ts,
    iso: new Date(ts).toISOString(),
    category,
    level,
    message,
    data,
  };
  push(entry);

  const line = fmt(category, message);
  switch (level) {
    case "error":
      data !== undefined ? console.error(line, data) : console.error(line);
      break;
    case "warn":
      data !== undefined ? console.warn(line, data) : console.warn(line);
      break;
    case "success":
      data !== undefined ? console.log(`%c${line}`, "color:#22c55e", data) : console.log(`%c${line}`, "color:#22c55e");
      break;
    default:
      data !== undefined ? console.log(line, data) : console.log(line);
  }
}

export const debugLog = {
  info: (category: DebugCategory, message: string, data?: unknown) => emit("info", category, message, data),
  warn: (category: DebugCategory, message: string, data?: unknown) => emit("warn", category, message, data),
  error: (category: DebugCategory, message: string, data?: unknown) => emit("error", category, message, data),
  success: (category: DebugCategory, message: string, data?: unknown) => emit("success", category, message, data),
};

export function getDebugLogs(filter?: { category?: DebugCategory; level?: DebugLevel }): DebugLogEntry[] {
  if (!filter) return [...buffer];
  return buffer.filter((e) =>
    (!filter.category || e.category === filter.category) &&
    (!filter.level || e.level === filter.level),
  );
}

export function clearDebugLogs() {
  buffer.length = 0;
}

export function dumpDebugLogsAsText(): string {
  return buffer
    .map((e) => `${e.iso} [${e.level.toUpperCase()}] [${e.category}] ${e.message}${e.data !== undefined ? " " + safeStringify(e.data) : ""}`)
    .join("\n");
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, val) => {
      if (val instanceof Error) return { name: val.name, message: val.message, stack: val.stack };
      if (val instanceof Uint8Array) return `Uint8Array(${val.length})`;
      return val;
    });
  } catch {
    return String(v);
  }
}

// Expõe helpers globais para depuração no DevTools
if (typeof window !== "undefined") {
  (window as any).__plbLogs = (filter?: { category?: DebugCategory; level?: DebugLevel }) => getDebugLogs(filter);
  (window as any).__plbLogsText = () => dumpDebugLogsAsText();
  (window as any).__plbLogsClear = () => clearDebugLogs();
  (window as any).__plbLogsCopy = async () => {
    try {
      await navigator.clipboard.writeText(dumpDebugLogsAsText());
      console.log("[debug-logger] Logs copiados para a área de transferência");
    } catch (e) {
      console.warn("[debug-logger] Falha ao copiar logs:", e);
    }
  };
}
