// Edge function: health-check
// Roda checagens + autocorreções IDEMPOTENTES (rotinas nomeadas) e audita
// cada ação no error_log com code = `auto_heal_<id>` e source = `auto_heal`.
//
// Endpoints:
//   GET  /functions/v1/health-check
//   POST /functions/v1/health-check                       -> roda tudo (checks + rotinas)
//   POST /functions/v1/health-check?action=list_rules     -> lista metadados das rotinas
//   POST /functions/v1/health-check?action=run_rule&id=X  -> roda apenas 1 rotina
//   POST /functions/v1/health-check?fix=function_not_unique (legado, compat)
//
// Nunca toca em: print_jobs (operação), bridge, electron, .exe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-trigger",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Severity = "error" | "warning" | "info";

interface Finding {
  code: string;
  severity: Severity;
  message: string;
  context?: Record<string, unknown>;
  auto_fixable?: boolean;
}

interface RuleResult {
  ok: boolean;
  affected: number;
  details: Record<string, unknown>;
  message: string;
}

interface HealRule {
  id: string;
  description: string;
  run: (supabase: any) => Promise<RuleResult>;
}

// ----------------- helpers -----------------

async function logToDb(
  supabase: any,
  source: string,
  severity: Severity,
  code: string,
  message: string,
  context: Record<string, unknown> = {},
  resolved = false,
) {
  try {
    await supabase.from("error_log").insert({
      source,
      severity,
      code,
      message,
      context,
      resolved,
      resolved_at: resolved ? new Date().toISOString() : null,
    } as any);
  } catch (_e) {
    // não relança — log de auditoria nunca pode quebrar a execução
  }
}

async function auditRule(
  supabase: any,
  rule: HealRule,
  result: RuleResult,
  durationMs: number,
  triggeredBy: string,
) {
  const severity: Severity = result.ok ? "info" : "error";
  const code = result.ok ? `auto_heal_${rule.id}` : `auto_heal_failed`;
  const msg = result.ok
    ? `[${rule.id}] ${result.affected} registro(s) afetado(s) — ${result.message}`
    : `[${rule.id}] FALHOU — ${result.message}`;
  await logToDb(supabase, "auto_heal", severity, code, msg, {
    rule_id: rule.id,
    description: rule.description,
    affected: result.affected,
    details: result.details,
    duration_ms: durationMs,
    triggered_by: triggeredBy,
    idempotent: true,
  }, true); // o log de auditoria nasce resolved
}

// ----------------- rotinas idempotentes -----------------

const HEAL_RULES: HealRule[] = [
  {
    id: "purge_old_errors",
    description: "Apaga registros do error_log com mais de 14 dias.",
    run: async (supabase) => {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString();
      const { error, count } = await supabase
        .from("error_log")
        .delete({ count: "exact" } as any)
        .lt("occurred_at", cutoff);
      if (error) return { ok: false, affected: 0, details: { cutoff }, message: error.message };
      return { ok: true, affected: count ?? 0, details: { cutoff }, message: `${count ?? 0} purgados` };
    },
  },

  {
    id: "auto_resolve_network_errors",
    description: "Resolve erros de rede sem reincidência nas últimas 2h.",
    run: async (supabase) => {
      const benign = ["network", "timeout", "fetcherror", "aborterror", "networkerror", "failed_to_fetch"];
      const recentCutoff = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
      let totalResolved = 0;
      const perCode: Record<string, number> = {};
      for (const code of benign) {
        const { count: recent } = await supabase
          .from("error_log")
          .select("id", { count: "exact", head: true })
          .eq("code", code)
          .gte("occurred_at", recentCutoff);
        if ((recent ?? 0) > 0) continue; // ainda reincidente
        const { error, count } = await supabase
          .from("error_log")
          .update(
            { resolved: true, resolved_at: new Date().toISOString() } as any,
            { count: "exact" } as any,
          )
          .eq("code", code)
          .eq("resolved", false);
        if (!error && count) {
          totalResolved += count;
          perCode[code] = count;
        }
      }
      return {
        ok: true,
        affected: totalResolved,
        details: { perCode, reason: "auto_resolved_no_recurrence_2h" },
        message: `${totalResolved} resolvidos`,
      };
    },
  },

  {
    id: "auto_resolve_transient_5xx",
    description: "Resolve erros 502/503/504 sem reincidência na última 1h.",
    run: async (supabase) => {
      const codes = ["502", "503", "504", "http_502", "http_503", "http_504", "bad_gateway", "service_unavailable", "gateway_timeout"];
      const recentCutoff = new Date(Date.now() - 60 * 60_000).toISOString();
      let totalResolved = 0;
      const perCode: Record<string, number> = {};
      for (const code of codes) {
        const { count: recent } = await supabase
          .from("error_log")
          .select("id", { count: "exact", head: true })
          .eq("code", code)
          .gte("occurred_at", recentCutoff);
        if ((recent ?? 0) > 0) continue;
        const { error, count } = await supabase
          .from("error_log")
          .update(
            { resolved: true, resolved_at: new Date().toISOString() } as any,
            { count: "exact" } as any,
          )
          .eq("code", code)
          .eq("resolved", false);
        if (!error && count) {
          totalResolved += count;
          perCode[code] = count;
        }
      }
      return {
        ok: true,
        affected: totalResolved,
        details: { perCode, reason: "auto_resolved_no_recurrence_1h" },
        message: `${totalResolved} resolvidos`,
      };
    },
  },

  {
    id: "fix_paid_without_served_at",
    description: "Preenche served_at em pedidos pagos sem timestamp de serviço.",
    run: async (supabase) => {
      const nowIso = new Date().toISOString();
      const { error, count } = await supabase
        .from("orders")
        .update({ served_at: nowIso } as any, { count: "exact" } as any)
        .eq("status", "paid")
        .is("served_at", null);
      if (error) return { ok: false, affected: 0, details: {}, message: error.message };
      return { ok: true, affected: count ?? 0, details: {}, message: `${count ?? 0} pedidos corrigidos` };
    },
  },

  {
    id: "dedupe_error_log_burst",
    description: "Marca como resolvidos bursts repetidos (>50 do mesmo code/source/message em 1h, mantendo os 10 mais recentes).",
    run: async (supabase) => {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { data: rows, error } = await supabase
        .from("error_log")
        .select("id, source, code, message, occurred_at, resolved")
        .gte("occurred_at", since)
        .eq("resolved", false)
        .limit(5000);
      if (error) return { ok: false, affected: 0, details: {}, message: error.message };

      const groups = new Map<string, { ids: number[] }>();
      for (const r of rows ?? []) {
        const key = `${r.source}::${r.code ?? ""}::${(r.message ?? "").slice(0, 120)}`;
        const g = groups.get(key) ?? { ids: [] };
        g.ids.push(r.id as number);
        groups.set(key, g);
      }
      let totalResolved = 0;
      const burstsTouched: { key: string; size: number; resolved: number }[] = [];
      for (const [key, g] of groups) {
        if (g.ids.length <= 50) continue;
        // mantém 10 mais recentes (maiores ids); resolve o resto
        const sorted = g.ids.sort((a, b) => b - a);
        const toResolve = sorted.slice(10);
        if (toResolve.length === 0) continue;
        const { error: upErr, count } = await supabase
          .from("error_log")
          .update(
            { resolved: true, resolved_at: new Date().toISOString() } as any,
            { count: "exact" } as any,
          )
          .in("id", toResolve)
          .eq("resolved", false);
        if (!upErr && count) {
          totalResolved += count;
          burstsTouched.push({ key, size: g.ids.length, resolved: count });
        }
      }
      return {
        ok: true,
        affected: totalResolved,
        details: { bursts: burstsTouched, reason: "deduplicated_burst" },
        message: `${totalResolved} dedupes`,
      };
    },
  },

  {
    id: "expire_old_warnings",
    description: "Resolve warnings com mais de 7 dias e sem reincidência nas últimas 24h.",
    run: async (supabase) => {
      const cutoffOld = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
      const recentCutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const { data: oldWarns, error } = await supabase
        .from("error_log")
        .select("id, code")
        .eq("severity", "warning")
        .eq("resolved", false)
        .lt("occurred_at", cutoffOld)
        .limit(2000);
      if (error) return { ok: false, affected: 0, details: {}, message: error.message };

      const byCode = new Map<string, number[]>();
      for (const r of oldWarns ?? []) {
        const c = (r.code as string) ?? "";
        const list = byCode.get(c) ?? [];
        list.push(r.id as number);
        byCode.set(c, list);
      }

      let totalResolved = 0;
      const perCode: Record<string, number> = {};
      for (const [code, ids] of byCode) {
        if (!code) continue;
        const { count: recent } = await supabase
          .from("error_log")
          .select("id", { count: "exact", head: true })
          .eq("code", code)
          .gte("occurred_at", recentCutoff);
        if ((recent ?? 0) > 0) continue; // ainda reincidente — não expira
        const { error: upErr, count } = await supabase
          .from("error_log")
          .update(
            { resolved: true, resolved_at: new Date().toISOString() } as any,
            { count: "exact" } as any,
          )
          .in("id", ids)
          .eq("resolved", false);
        if (!upErr && count) {
          totalResolved += count;
          perCode[code] = count;
        }
      }
      return {
        ok: true,
        affected: totalResolved,
        details: { perCode, reason: "auto_expired_7d_no_recurrence_24h" },
        message: `${totalResolved} expirados`,
      };
    },
  },
];

// ----------------- checks (mantidos) -----------------

async function runChecks(supabase: any): Promise<Finding[]> {
  const findings: Finding[] = [];

  // create_public_order deve existir 1x
  try {
    const { data, error } = await supabase.rpc("count_public_order_funcs" as any).single();
    if (!error) {
      const n = Number((data as any)?.n ?? 1);
      if (n !== 1) {
        findings.push({
          code: "function_not_unique",
          severity: "error",
          message: `create_public_order existe ${n} vezes (esperado: 1).`,
          context: { count: n },
          auto_fixable: true,
        });
      }
    }
  } catch (_e) { /* ignore */ }

  // Pedidos new/preparing parados
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

  // Print jobs travados (apenas warning, não corrige)
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

// ----------------- correção pontual legada -----------------

async function applyFixFunctionNotUnique(
  supabase: any,
): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.rpc("fix_create_public_order_duplicate" as any);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Duplicata removida (se existia)." };
}

// ----------------- runner -----------------

async function runAllRules(supabase: any, triggeredBy: string) {
  const summary: { rule_id: string; ok: boolean; affected: number; duration_ms: number }[] = [];
  for (const rule of HEAL_RULES) {
    const t0 = Date.now();
    let result: RuleResult;
    try {
      result = await rule.run(supabase);
    } catch (e: any) {
      result = { ok: false, affected: 0, details: {}, message: e?.message ?? String(e) };
    }
    const duration = Date.now() - t0;
    await auditRule(supabase, rule, result, duration, triggeredBy);
    summary.push({ rule_id: rule.id, ok: result.ok, affected: result.affected, duration_ms: duration });
  }
  return summary;
}

// ----------------- HTTP handler -----------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const fix = url.searchParams.get("fix");
  const triggeredBy = req.headers.get("x-trigger") || url.searchParams.get("trigger") || "manual";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // list_rules
    if (action === "list_rules") {
      return new Response(
        JSON.stringify({
          ok: true,
          rules: HEAL_RULES.map((r) => ({ id: r.id, description: r.description })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // run_rule (apenas 1 rotina)
    if (action === "run_rule") {
      const id = url.searchParams.get("id");
      const rule = HEAL_RULES.find((r) => r.id === id);
      if (!rule) {
        return new Response(JSON.stringify({ ok: false, error: `rule '${id}' não encontrada` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }
      const t0 = Date.now();
      let result: RuleResult;
      try {
        result = await rule.run(supabase);
      } catch (e: any) {
        result = { ok: false, affected: 0, details: {}, message: e?.message ?? String(e) };
      }
      const duration = Date.now() - t0;
      await auditRule(supabase, rule, result, duration, triggeredBy);
      return new Response(JSON.stringify({ ok: result.ok, rule: rule.id, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: result.ok ? 200 : 500,
      });
    }

    // legado: ?fix=function_not_unique
    if (fix === "function_not_unique") {
      const result = await applyFixFunctionNotUnique(supabase);
      await logToDb(
        supabase,
        "auto_heal",
        result.ok ? "info" : "error",
        result.ok ? "auto_heal_function_not_unique" : "auto_heal_failed",
        `[function_not_unique] ${result.message}`,
        { rule_id: "function_not_unique", triggered_by: triggeredBy, idempotent: true },
        true,
      );
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: result.ok ? 200 : 500,
      });
    }

    // padrão: checks + todas as rotinas
    const findings = await runChecks(supabase);
    for (const f of findings) {
      await logToDb(supabase, "health-check", f.severity, f.code, f.message, {
        ...(f.context || {}),
        auto_fixable: f.auto_fixable === true,
        from: "health-check",
      });
    }

    const ruleSummary = await runAllRules(supabase, triggeredBy);
    const totalAffected = ruleSummary.reduce((s, r) => s + r.affected, 0);
    const failures = ruleSummary.filter((r) => !r.ok).length;

    await logToDb(
      supabase,
      "auto_heal",
      failures > 0 ? "warning" : "info",
      "auto_heal_run_summary",
      `Auto-heal executado: ${ruleSummary.length} rotinas, ${totalAffected} afetados, ${failures} falhas.`,
      {
        rules_executed: ruleSummary.length,
        total_affected: totalAffected,
        failures,
        triggered_by: triggeredBy,
        per_rule: ruleSummary,
        findings_count: findings.length,
      },
      true,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        findings,
        applied: ruleSummary.filter((r) => r.affected > 0).map((r) => `${r.rule_id}:${r.affected}`),
        rule_summary: ruleSummary,
        triggered_by: triggeredBy,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e: any) {
    await logToDb(
      supabase,
      "health-check",
      "error",
      "health_check_failed",
      `Health-check falhou: ${e?.message ?? String(e)}`,
      { stack: String(e?.stack ?? "").slice(0, 1500), triggered_by: triggeredBy },
    );
    return new Response(JSON.stringify({ ok: false, error: e?.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
