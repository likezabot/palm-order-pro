// Edge function: health-check
// Verifica saúde do banco + auto-corrige problemas seguros + grava resumo em error_log.
// Pode ser chamada por cron (a cada 5 min) ou manualmente pelo Admin.
//
// Endpoints:
//   GET  /functions/v1/health-check          -> roda verificação completa
//   POST /functions/v1/health-check          -> roda verificação completa
//   POST /functions/v1/health-check?fix=function_not_unique -> tenta correção pontual
//
// Nunca toca em: print_jobs (operação), bridge, electron, .exe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Finding {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  context?: Record<string, unknown>;
  auto_fixable?: boolean;
}

async function logToDb(
  supabase: any,
  source: string,
  severity: "error" | "warning" | "info",
  code: string,
  message: string,
  context: Record<string, unknown> = {},
) {
  await supabase.from("error_log").insert({
    source,
    severity,
    code,
    message,
    context,
  } as any);
}

async function runChecks(supabase: any): Promise<Finding[]> {
  const findings: Finding[] = [];

  // 1) create_public_order deve existir EXATAMENTE 1 vez
  try {
    const { data, error } = await supabase.rpc("count_public_order_funcs" as any).single();
    if (error) {
      // fallback: assume OK se a função utilitária não existir
    } else {
      const n = Number((data as any)?.n ?? 1);
      if (n !== 1) {
        findings.push({
          code: "function_not_unique",
          severity: "error",
          message: `create_public_order existe ${n} vezes (esperado: 1). Pode quebrar checkout público.`,
          context: { count: n },
          auto_fixable: true,
        });
      }
    }
  } catch (_e) {
    /* ignore */
  }

  // 2) Pedidos paid sem served_at (auto-fixable)
  const { data: paidNoServed } = await supabase
    .from("orders")
    .select("id")
    .eq("status", "paid")
    .is("served_at", null)
    .limit(50);
  if (paidNoServed && paidNoServed.length > 0) {
    findings.push({
      code: "paid_without_served_at",
      severity: "info",
      message: `${paidNoServed.length} pedido(s) pago(s) sem served_at.`,
      context: { ids: paidNoServed.map((o: any) => o.id) },
      auto_fixable: true,
    });
  }

  // 3) Pedidos new/preparing parados há > 60 min
  const cutoffStale = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: stale } = await supabase
    .from("orders")
    .select("id, status, updated_at")
    .in("status", ["new", "preparing"])
    .lt("updated_at", cutoffStale)
    .limit(20);
  if (stale && stale.length > 0) {
    findings.push({
      code: "stale_order",
      severity: "warning",
      message: `${stale.length} pedido(s) parados há mais de 60 min.`,
      context: { samples: stale.slice(0, 5) },
    });
  }

  // 4) Print jobs travados (somente AVISO, não corrige)
  const cutoffPrint = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: stuckPrint } = await supabase
    .from("print_jobs")
    .select("id, attempts, last_error")
    .eq("status", "queued")
    .lt("created_at", cutoffPrint)
    .limit(20);
  if (stuckPrint && stuckPrint.length > 0) {
    findings.push({
      code: "stuck_print",
      severity: "warning",
      message: `${stuckPrint.length} job(s) de impressão travados há mais de 10 min.`,
      context: { samples: stuckPrint.slice(0, 5) },
    });
  }

  return findings;
}

async function autoFix(
  supabase: any,
  findings: Finding[],
): Promise<string[]> {
  const applied: string[] = [];

  // paid_without_served_at -> preencher served_at
  const f1 = findings.find((f) => f.code === "paid_without_served_at");
  if (f1 && Array.isArray((f1.context as any)?.ids)) {
    const ids = (f1.context as any).ids as string[];
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("orders")
      .update({ served_at: nowIso } as any)
      .in("id", ids)
      .is("served_at", null);
    if (!error) applied.push(`paid_without_served_at:${ids.length}`);
  }

  // limpar error_log antigo (>14 dias)
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString();
  const { error: delErr, count } = await supabase
    .from("error_log")
    .delete({ count: "exact" } as any)
    .lt("occurred_at", cutoff);
  if (!delErr && count) applied.push(`purged_old_errors:${count}`);

  // auto-resolve códigos benignos sem reincidência nas últimas 2h
  const recentCutoff = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const benign = ["network", "timeout", "fetcherror", "aborterror"];
  for (const code of benign) {
    const { data: recent } = await supabase
      .from("error_log")
      .select("id")
      .eq("code", code)
      .gte("occurred_at", recentCutoff)
      .limit(1);
    if (recent && recent.length === 0) {
      const ids = await markResolved(supabase, { code }, "auto_resolved_no_recurrence");
      if (ids > 0) applied.push(`auto_resolved:${code}:${ids}`);
    }
  }

  // ---- NOVO: auto-heal de códigos recorrentes ----
  const healed = await autoHealRecurring(supabase);
  applied.push(...healed);

  return applied;
}

/**
 * Marca registros do error_log como resolved e injeta um motivo no contexto JSONB.
 * Retorna quantos foram afetados.
 */
async function markResolved(
  supabase: any,
  match: { code?: string; ids?: number[] },
  reason: string,
): Promise<number> {
  const nowIso = new Date().toISOString();
  let q = supabase
    .from("error_log")
    .update(
      { resolved: true, resolved_at: nowIso } as any,
      { count: "exact" } as any,
    )
    .eq("resolved", false);
  if (match.ids && match.ids.length) q = q.in("id", match.ids);
  if (match.code) q = q.eq("code", match.code);
  const { error, count } = await q;
  if (error) return 0;

  // Anota o motivo no contexto via RPC (merge no JSONB)
  try {
    await supabase.rpc("annotate_error_log_resolution" as any, {
      p_code: match.code ?? null,
      p_ids: match.ids ?? null,
      p_reason: reason,
    });
  } catch {
    /* opcional */
  }
  return count ?? 0;
}

/**
 * Registry de auto-correção por código recorrente.
 * Cada entrada define:
 *  - threshold: quantas ocorrências em 24h disparam o fix
 *  - fix(supabase): aplica a correção; retorna { ok, message }
 */
type RecurringFix = {
  code: string;
  threshold: number;
  description: string;
  fix: (supabase: any) => Promise<{ ok: boolean; message: string }>;
};

const RECURRING_FIXES: RecurringFix[] = [
  {
    code: "function_not_unique",
    threshold: 1, // crítico — qualquer ocorrência aciona
    description: "Remove versão duplicada de create_public_order",
    fix: async (supabase) => {
      const { data, error } = await supabase.rpc("fix_create_public_order_duplicate" as any);
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: String(data ?? "fix aplicado") };
    },
  },
  {
    code: "pgrst116", // PostgREST: query with multiple results / not unique
    threshold: 3,
    description: "Função RPC ambígua — tenta resolver duplicata conhecida",
    fix: async (supabase) => {
      const { data, error } = await supabase.rpc("fix_create_public_order_duplicate" as any);
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: String(data ?? "tentativa aplicada") };
    },
  },
  {
    code: "paid_without_served_at",
    threshold: 1,
    description: "Preenche served_at em pedidos pagos",
    fix: async (supabase) => {
      const nowIso = new Date().toISOString();
      const { error, count } = await supabase
        .from("orders")
        .update({ served_at: nowIso } as any, { count: "exact" } as any)
        .eq("status", "paid")
        .is("served_at", null);
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: `${count ?? 0} pedido(s) corrigido(s)` };
    },
  },
];

async function autoHealRecurring(supabase: any): Promise<string[]> {
  const out: string[] = [];
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  for (const rule of RECURRING_FIXES) {
    // Conta ocorrências nas últimas 24h, ainda não resolvidas
    const { count, error: cErr } = await supabase
      .from("error_log")
      .select("id", { count: "exact", head: true })
      .eq("code", rule.code)
      .eq("resolved", false)
      .gte("occurred_at", since);

    if (cErr) continue;
    const n = count ?? 0;
    if (n < rule.threshold) continue;

    // Aplica a correção
    let result: { ok: boolean; message: string };
    try {
      result = await rule.fix(supabase);
    } catch (e: any) {
      result = { ok: false, message: e?.message ?? String(e) };
    }

    // Loga o resultado da auto-correção
    await logToDb(
      supabase,
      "other",
      result.ok ? "info" : "error",
      result.ok ? "auto_heal_applied" : "auto_heal_failed",
      `[auto-heal] ${rule.code} (${n}x): ${result.message}`,
      {
        rule: rule.code,
        description: rule.description,
        occurrences_24h: n,
        result,
      },
    );

    if (result.ok) {
      const reason = `auto_heal: ${rule.description} → ${result.message}`;
      const resolved = await markResolved(supabase, { code: rule.code }, reason);
      out.push(`auto_heal:${rule.code}:${n}->resolved:${resolved}`);
    } else {
      out.push(`auto_heal_failed:${rule.code}:${n}`);
    }
  }

  return out;
}


  return applied;
}

async function applyFixFunctionNotUnique(
  supabase: any,
): Promise<{ ok: boolean; message: string }> {
  // Tenta dropar a versão antiga da assinatura conhecida.
  const { error } = await supabase.rpc("fix_create_public_order_duplicate" as any);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Duplicata removida (se existia)." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const fix = url.searchParams.get("fix");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // Caminho de correção pontual
    if (fix === "function_not_unique") {
      const result = await applyFixFunctionNotUnique(supabase);
      await logToDb(
        supabase,
        "other",
        result.ok ? "info" : "error",
        result.ok ? "fix_applied" : "fix_failed",
        `[health-check] fix function_not_unique: ${result.message}`,
        { fix: "function_not_unique" },
      );
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: result.ok ? 200 : 500,
      });
    }

    const findings = await runChecks(supabase);
    const applied = await autoFix(supabase, findings);

    // Loga cada finding individualmente (severidade real)
    for (const f of findings) {
      await logToDb(supabase, "other", f.severity, f.code, f.message, {
        ...(f.context || {}),
        auto_fixable: f.auto_fixable === true,
        from: "health-check",
      });
    }

    // Resumo
    const summary = {
      total_findings: findings.length,
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
      info: findings.filter((f) => f.severity === "info").length,
      auto_fixes_applied: applied,
    };
    await logToDb(
      supabase,
      "other",
      summary.errors > 0 ? "warning" : "info",
      "health_check_summary",
      `Verificação automática: ${summary.total_findings} achado(s), ${applied.length} correção(ões) aplicadas.`,
      summary,
    );

    return new Response(JSON.stringify({ ok: true, findings, applied }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    await logToDb(
      supabase,
      "other",
      "error",
      "health_check_failed",
      `Health-check falhou: ${e?.message ?? String(e)}`,
      { stack: String(e?.stack ?? "").slice(0, 1500) },
    );
    return new Response(JSON.stringify({ ok: false, error: e?.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
