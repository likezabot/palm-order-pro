/**
 * Repositório central de erros do sistema.
 *
 * Insere registros em `public.error_log` para que o Admin possa
 * consultar tudo que falhou no dia (cardápio público, PDV, cozinha, palm, bridge…).
 *
 * Falhas no próprio log são silenciosas — nunca devem quebrar o fluxo principal.
 *
 * NOVO: captura global automática (window.onerror / unhandledrejection / console.error)
 * + dedupe + throttle para evitar spam.
 */
import { supabase } from "@/integrations/supabase/client";

export type ErrorSource =
  | "public_checkout"
  | "public_menu"
  | "pdv"
  | "kitchen"
  | "palm"
  | "admin"
  | "bridge"
  | "rpc"
  | "realtime"
  | "print"
  | "global"
  | "console"
  | "other";

export type ErrorSeverity = "error" | "warning" | "info";

export interface LogErrorInput {
  source: ErrorSource;
  message: string;
  code?: string | null;
  severity?: ErrorSeverity;
  context?: Record<string, unknown>;
}

/** Extrai um "código" curto da mensagem do Postgres/Supabase (ex: 'restaurant_closed'). */
export function extractErrorCode(raw: unknown): string | null {
  const msg = String((raw as any)?.message ?? raw ?? "");
  const m = msg.match(/[a-z_][a-z0-9_]{2,}/i);
  return m ? m[0].toLowerCase().slice(0, 64) : null;
}

// ---------- Anti-spam: dedupe + throttle ----------
const DEDUPE_WINDOW_MS = 30_000;
const THROTTLE_WINDOW_MS = 60_000;
const THROTTLE_MAX = 20;

const recentKeys = new Map<string, number>();
const sentTimestamps: number[] = [];

function shouldSkip(key: string): boolean {
  const now = Date.now();
  // limpa antigos
  for (const [k, t] of recentKeys) {
    if (now - t > DEDUPE_WINDOW_MS) recentKeys.delete(k);
  }
  while (sentTimestamps.length && now - sentTimestamps[0] > THROTTLE_WINDOW_MS) {
    sentTimestamps.shift();
  }
  if (recentKeys.has(key)) return true;
  if (sentTimestamps.length >= THROTTLE_MAX) return true;
  recentKeys.set(key, now);
  sentTimestamps.push(now);
  return false;
}

export async function logError(input: LogErrorInput): Promise<void> {
  try {
    const message = String(input.message ?? "").slice(0, 2000);
    const code = input.code ?? extractErrorCode(message);
    const dedupeKey = `${input.source}|${code || ""}|${message.slice(0, 120)}`;
    if (shouldSkip(dedupeKey)) return;

    const ctx: Record<string, unknown> = {
      ...(input.context || {}),
      url: typeof window !== "undefined" ? window.location.href : undefined,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      viewport:
        typeof window !== "undefined"
          ? { w: window.innerWidth, h: window.innerHeight }
          : undefined,
      ts_client: new Date().toISOString(),
    };

    await supabase.from("error_log" as any).insert({
      source: input.source,
      severity: input.severity ?? "error",
      code: code ?? null,
      message,
      context: ctx,
    });
  } catch {
    // silencioso por design
  }
}

// ---------- Captura global ----------

let installed = false;

/**
 * Instala captadores globais:
 *  - window.onerror
 *  - window.onunhandledrejection
 *  - wrapper de console.error (preserva o original)
 *
 * Idempotente: chamadas múltiplas não duplicam handlers.
 */
export function installGlobalErrorCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    try {
      const err = event.error;
      const message = err?.message || event.message || "window error";
      const stack = err?.stack ? String(err.stack).slice(0, 1500) : undefined;
      void logError({
        source: "global",
        message,
        code: err?.name ? String(err.name).toLowerCase() : "window_error",
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack,
        },
      });
    } catch {
      /* noop */
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason: any = event.reason;
      const message =
        (reason && (reason.message || reason.toString?.())) || "unhandled rejection";
      const stack = reason?.stack ? String(reason.stack).slice(0, 1500) : undefined;
      void logError({
        source: "global",
        message: String(message).slice(0, 2000),
        code: "unhandled_rejection",
        context: { stack, reason: safeStringify(reason) },
      });
    } catch {
      /* noop */
    }
  });

  // Wrapper de console.error — preserva original e envia ao log.
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      origError(...args);
      // ignora barulho conhecido do React DevTools / HMR
      const first = String(args[0] ?? "");
      if (
        first.includes("Warning:") ||
        first.includes("[HMR]") ||
        first.includes("[vite]") ||
        first.includes("Download the React DevTools")
      ) {
        return;
      }
      const message = args
        .map((a) => (typeof a === "string" ? a : safeStringify(a)))
        .join(" ")
        .slice(0, 2000);
      void logError({
        source: "console",
        message,
        code: "console_error",
        severity: "warning",
      });
    } catch {
      /* noop */
    }
  };
}

function safeStringify(v: unknown): string {
  try {
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    return JSON.stringify(v, Object.getOwnPropertyNames(v as any)).slice(0, 1000);
  } catch {
    return String(v).slice(0, 1000);
  }
}
