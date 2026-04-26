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
  | "fetch"
  | "xhr"
  | "webusb"
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
const MAX_CONTEXT_BYTES = 20_000; // contexto malformado/grande não vai quebrar nem encher tabela

const recentKeys = new Map<string, number>();
const sentTimestamps: number[] = [];

// Re-entrância: garante que o próprio fluxo de log nunca dispare logs
// recursivos (ex.: console.error wrappado por nós que internamente loga
// um erro do supabase, que então passa pelo fetch interceptor, etc.).
let __plbLogging = false;

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
  if (__plbLogging) return; // proteção anti-loop: não loga durante log
  __plbLogging = true;
  try {
    const message = String(input.message ?? "").slice(0, 2000);
    const code = input.code ?? extractErrorCode(message);
    const dedupeKey = `${input.source}|${code || ""}|${message.slice(0, 120)}`;
    if (shouldSkip(dedupeKey)) return;

    let ctx: Record<string, unknown> = {
      ...(input.context || {}),
      url: typeof window !== "undefined" ? window.location.href : undefined,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      viewport:
        typeof window !== "undefined"
          ? { w: window.innerWidth, h: window.innerHeight }
          : undefined,
      ts_client: new Date().toISOString(),
    };

    // Trunca contexto se virar gigante (proteção contra payloads malformados)
    try {
      const serialized = JSON.stringify(ctx);
      if (serialized.length > MAX_CONTEXT_BYTES) {
        ctx = {
          _truncated: true,
          _original_size: serialized.length,
          preview: serialized.slice(0, MAX_CONTEXT_BYTES),
          url: ctx.url,
          ts_client: ctx.ts_client,
        };
      }
    } catch {
      ctx = { _unserializable: true, url: ctx.url, ts_client: ctx.ts_client };
    }

    await supabase.from("error_log" as any).insert({
      source: input.source,
      severity: input.severity ?? "error",
      code: code ?? null,
      message,
      context: ctx,
    });
  } catch {
    // silencioso por design
  } finally {
    __plbLogging = false;
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

  // ---- fetch ----
  installFetchInterceptor();
  // ---- XHR ----
  installXhrInterceptor();
  // ---- Supabase RPC ----
  installSupabaseRpcInterceptor();
  // ---- WebUSB ----
  installWebUsbInterceptor();
}

// Hosts ignorados (evita loop ao logar o próprio insert do error_log e telemetria do Lovable/Vite)
const IGNORE_URL_PATTERNS = [
  /\/rest\/v1\/error_log/i,
  /supabase\.co\/auth\/v1\/token/i, // token refresh — barulhento e benigno
  /\/functions\/v1\/health-check/i, // o painel já trata erro localmente
  /lovable\.app\/.*\/(ping|telemetry|analytics)/i,
  /__vite|vite-hmr|@vite|@react-refresh/i,
  /localhost:9100/i, // bridge local — offline esperado em web; já tratado pelo monitor de bridge
];

function shouldIgnoreUrl(url: string): boolean {
  return IGNORE_URL_PATTERNS.some((re) => re.test(url));
}

function getMethod(init?: RequestInit, input?: RequestInfo | URL): string {
  if (init?.method) return init.method.toUpperCase();
  if (input && typeof input !== "string" && !(input instanceof URL) && (input as Request).method) {
    return (input as Request).method.toUpperCase();
  }
  return "GET";
}

function getUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

function installFetchInterceptor() {
  if (typeof window === "undefined" || !window.fetch) return;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getUrlString(input);
    const method = getMethod(init, input);
    try {
      const res = await orig(input as any, init);
      // status >= 400 → loga (HTTP error)
      if (!res.ok && !shouldIgnoreUrl(url)) {
        // Clona para não consumir o body original
        let bodySnippet: string | undefined;
        try {
          const clone = res.clone();
          const text = await clone.text();
          bodySnippet = text.slice(0, 500);
        } catch {
          /* ignore */
        }
        void logError({
          source: "fetch",
          severity: res.status >= 500 ? "error" : "warning",
          code: `http_${res.status}`,
          message: `${method} ${shortUrl(url)} → ${res.status}`,
          context: {
            url,
            method,
            status: res.status,
            status_text: res.statusText,
            body_snippet: bodySnippet,
          },
        });
      }
      return res;
    } catch (err: any) {
      if (!shouldIgnoreUrl(url)) {
        void logError({
          source: "fetch",
          message: `${method} ${shortUrl(url)} falhou: ${err?.message ?? String(err)}`,
          code: err?.name ? String(err.name).toLowerCase() : "fetch_error",
          context: {
            url,
            method,
            stack: err?.stack ? String(err.stack).slice(0, 1500) : undefined,
          },
        });
      }
      throw err;
    }
  };
}

function installXhrInterceptor() {
  if (typeof XMLHttpRequest === "undefined") return;
  const OrigOpen = XMLHttpRequest.prototype.open;
  const OrigSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest & { __plb?: { method: string; url: string } },
    method: string,
    url: string | URL,
    ...rest: any[]
  ) {
    this.__plb = { method: String(method).toUpperCase(), url: String(url) };
    return (OrigOpen as any).call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest & { __plb?: { method: string; url: string } },
    body?: any,
  ) {
    const meta = this.__plb;
    const onError = () => {
      try {
        if (!meta || shouldIgnoreUrl(meta.url)) return;
        const status = this.status;
        if (status === 0) {
          void logError({
            source: "xhr",
            message: `${meta.method} ${shortUrl(meta.url)} falhou (network)`,
            code: "xhr_network",
            context: { url: meta.url, method: meta.method, status },
          });
        } else if (status >= 400) {
          void logError({
            source: "xhr",
            severity: status >= 500 ? "error" : "warning",
            code: `http_${status}`,
            message: `${meta.method} ${shortUrl(meta.url)} → ${status}`,
            context: {
              url: meta.url,
              method: meta.method,
              status,
              response_snippet: String(this.responseText ?? "").slice(0, 500),
            },
          });
        }
      } catch {
        /* noop */
      }
    };
    this.addEventListener("error", onError);
    this.addEventListener("loadend", () => {
      if (this.status >= 400 || this.status === 0) onError();
    });
    return OrigSend.call(this, body);
  };
}

function installSupabaseRpcInterceptor() {
  // Encapsula supabase.rpc para capturar TODA resposta com error.
  const sb = supabase as any;
  if (!sb || typeof sb.rpc !== "function" || sb.__plbRpcWrapped) return;
  const origRpc = sb.rpc.bind(sb);
  sb.__plbRpcWrapped = true;

  sb.rpc = function (fn: string, args?: any, options?: any) {
    const builder = origRpc(fn, args, options);
    // Os builders do supabase-js são thenable; envolvemos o then para inspecionar erros.
    const origThen = builder.then?.bind(builder);
    if (!origThen) return builder;

    builder.then = (onFulfilled: any, onRejected: any) =>
      origThen((res: any) => {
        try {
          if (res?.error) {
            const err = res.error;
            void logError({
              source: "rpc",
              severity: "error",
              code: err.code ? String(err.code).toLowerCase() : extractErrorCode(err.message) || "rpc_error",
              message: `RPC ${fn} falhou: ${err.message ?? "erro desconhecido"}`,
              context: {
                fn,
                args: safeJsonClone(args),
                hint: err.hint,
                details: err.details,
                pg_code: err.code,
              },
            });
          }
        } catch {
          /* noop */
        }
        return onFulfilled ? onFulfilled(res) : res;
      }, onRejected);
    return builder;
  };
}

function installWebUsbInterceptor() {
  const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
  if (!nav?.usb) return;
  if (nav.usb.__plbWrapped) return;
  nav.usb.__plbWrapped = true;

  const origRequest = nav.usb.requestDevice?.bind(nav.usb);
  if (origRequest) {
    nav.usb.requestDevice = async (filters?: any) => {
      try {
        return await origRequest(filters);
      } catch (err: any) {
        // Usuário cancelar a seleção é benigno → só loga como info
        const isCancel = err?.name === "NotFoundError";
        void logError({
          source: "webusb",
          severity: isCancel ? "info" : "error",
          code: err?.name ? String(err.name).toLowerCase() : "usb_request_failed",
          message: `WebUSB requestDevice falhou: ${err?.message ?? String(err)}`,
          context: { filters: safeJsonClone(filters) },
        });
        throw err;
      }
    };
  }

  // Captura erros de comunicação posteriores: open/transferIn/transferOut/claimInterface…
  // Patcheamos o protótipo USBDevice quando disponível.
  const proto = (window as any).USBDevice?.prototype;
  if (proto && !proto.__plbWrapped) {
    proto.__plbWrapped = true;
    const wrap = (name: string) => {
      const orig = proto[name];
      if (typeof orig !== "function") return;
      proto[name] = async function (...args: any[]) {
        try {
          return await orig.apply(this, args);
        } catch (err: any) {
          void logError({
            source: "webusb",
            code: err?.name ? String(err.name).toLowerCase() : `usb_${name}_failed`,
            message: `WebUSB ${name} falhou: ${err?.message ?? String(err)}`,
            context: {
              op: name,
              vendor_id: this?.vendorId,
              product_id: this?.productId,
              product_name: this?.productName,
              args_summary: safeJsonClone(args)?.toString?.().slice(0, 200),
            },
          });
          throw err;
        }
      };
    };
    ["open", "close", "selectConfiguration", "claimInterface", "releaseInterface", "transferIn", "transferOut", "controlTransferIn", "controlTransferOut", "reset"].forEach(wrap);
  }
}

function shortUrl(u: string): string {
  try {
    const url = new URL(u, typeof window !== "undefined" ? window.location.origin : "http://x");
    return `${url.pathname}${url.search ? "?…" : ""}`;
  } catch {
    return u.slice(0, 120);
  }
}

function safeJsonClone(v: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return undefined;
  }
}

function safeStringify(v: unknown): string {
  try {
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    return JSON.stringify(v, Object.getOwnPropertyNames(v as any)).slice(0, 1000);
  } catch {
    return String(v).slice(0, 1000);
  }
}
