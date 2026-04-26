/**
 * Repositório central de erros do sistema.
 *
 * Insere registros em `public.error_log` para que o Admin possa
 * consultar tudo que falhou no dia (cardápio público, PDV, cozinha, palm, bridge…).
 *
 * Falhas no próprio log são silenciosas — nunca devem quebrar o fluxo principal.
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

export async function logError(input: LogErrorInput): Promise<void> {
  try {
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
      code: input.code ?? null,
      message: String(input.message ?? "").slice(0, 2000),
      context: ctx,
    });
  } catch {
    // silencioso por design
  }
}
