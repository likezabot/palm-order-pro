// Edge function: db-consistency-check
//
// Roda uma verificação de consistência do banco (existência única e
// assinatura correta das RPCs críticas) e registra cada divergência em
// public.error_log com source='db-consistency'.
//
// Disparada:
//   1) No "boot" da função (cold start) — primeira invocação após deploy/idle.
//   2) Por cron a cada 15 min (definido em cron job pg_cron).
//   3) Manualmente pelo cliente (Admin) ou pelo bootstrap do app no main.tsx.
//
// Endpoints:
//   GET  /functions/v1/db-consistency-check  -> roda verificação e retorna JSON
//   POST /functions/v1/db-consistency-check  -> idem
//
// Resposta:
//   { ok: true, issues: [...], summary: { total, errors, warnings } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Issue {
  code: string;
  severity: "error" | "warning" | "info";
  function?: string;
  message: string;
  expected?: unknown;
  found?: unknown;
  count?: number;
  expected_signatures?: unknown;
}

async function logToDb(
  supabase: ReturnType<typeof createClient>,
  severity: "error" | "warning" | "info",
  code: string,
  message: string,
  context: Record<string, unknown> = {},
) {
  try {
    await supabase.from("error_log").insert({
      source: "db-consistency",
      severity,
      code,
      message,
      context,
              } as never);
  } catch {
    /* never throw from logger */
  }
}

async function runConsistencyCheck(
  supabase: ReturnType<typeof createClient>,
): Promise<{
  issues: Issue[];
  summary: { total: number; errors: number; warnings: number; info: number };
}> {
  // 1) Chama a RPC server-side que faz a verificação
  const { data, error } = await supabase.rpc("verify_rpc_consistency" as never);

  if (error) {
    await logToDb(
      supabase,
      "error",
      "consistency_check_failed",
      `Falha ao executar verify_rpc_consistency: ${error.message}`,
      { pg_code: (error as { code?: string }).code, hint: (error as { hint?: string }).hint },
    );
    throw error;
  }

  const payload = (data ?? {}) as { issues?: Issue[] };
  const issues: Issue[] = Array.isArray(payload.issues) ? payload.issues : [];

  const summary = {
    total: issues.length,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
  };

  // 2) Registra cada divergência individualmente em error_log
  for (const issue of issues) {
    await logToDb(
      supabase,
      issue.severity,
      issue.code,
      issue.message,
      {
        function: issue.function,
        expected: issue.expected ?? issue.expected_signatures,
        found: issue.found,
        count: issue.count,
        from: "db-consistency-check",
      },
    );
  }

  // 3) Resumo (sempre logado para histórico)
  await logToDb(
    supabase,
    summary.errors > 0 ? "error" : summary.warnings > 0 ? "warning" : "info",
    "consistency_check_summary",
    summary.total === 0
      ? "Verificação de consistência: OK ✓"
      : `Verificação de consistência: ${summary.total} divergência(s) (${summary.errors} erro(s), ${summary.warnings} aviso(s)).`,
    { ...summary, ran_from: "edge-function-boot-or-cron" },
  );

  return { issues, summary };
}

// === BOOT-TIME CHECK ===
// Executa imediatamente quando o módulo é carregado (cold start da edge function).
// Equivale ao "ao iniciar o servidor".
const bootClient = createClient(SUPABASE_URL, SERVICE_ROLE);
runConsistencyCheck(bootClient).catch(async (e) => {
  await logToDb(
    bootClient,
    "error",
    "consistency_check_boot_failed",
    `Boot check falhou: ${e?.message ?? String(e)}`,
    { stack: String(e?.stack ?? "").slice(0, 1500) },
  );
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const result = await runConsistencyCheck(supabase);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
