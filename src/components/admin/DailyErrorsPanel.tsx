import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Filter,
  Activity,
  Wrench,
  Calendar,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type ErrorLogRow = {
  id: number;
  occurred_at: string;
  source: string;
  severity: string;
  code: string | null;
  message: string;
  context: Record<string, unknown> | null;
  resolved: boolean;
  resolved_at: string | null;
};

const SOURCES = [
  "all",
  "global",
  "console",
  "fetch",
  "xhr",
  "rpc",
  "webusb",
  "public_checkout",
  "public_menu",
  "pdv",
  "kitchen",
  "palm",
  "admin",
  "bridge",
  "realtime",
  "print",
  "health-check",
  "auto_heal",
  "other",
] as const;
const SEVERITIES = ["all", "error", "warning", "info"] as const;

// Códigos com correção pontual conhecida via /functions/v1/health-check?fix=...
const KNOWN_FIXES: Record<string, string> = {
  function_not_unique: "function_not_unique",
  pgrst116: "function_not_unique",
};

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function safeStringifyContext(ctx: unknown): string {
  if (ctx == null) return "{}";
  if (typeof ctx === "string") return ctx.slice(0, 20_000);
  try {
    const s = JSON.stringify(ctx, null, 2);
    return s.length > 20_000 ? s.slice(0, 20_000) + "\n…(truncado)" : s;
  } catch {
    try { return String(ctx).slice(0, 20_000); } catch { return "[contexto não serializável]"; }
  }
}

export default function DailyErrorsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showResolved, setShowResolved] = useState(false);
  const [source, setSource] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [running, setRunning] = useState(false);
  const [fixing, setFixing] = useState<number | null>(null);
  const [reprocessing, setReprocessing] = useState<number | null>(null);

  const todayIso = useMemo(() => startOfTodayIso(), []);

  const query = useQuery({
    queryKey: ["error_log_today", source, severity, showResolved, todayIso],
    queryFn: async () => {
      let q = supabase
        .from("error_log" as never)
        .select("*")
        .gte("occurred_at", todayIso)
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (!showResolved) q = q.eq("resolved", false);
      if (source !== "all") q = q.eq("source", source);
      if (severity !== "all") q = q.eq("severity", severity);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ErrorLogRow[];
    },
    refetchInterval: 30_000,
  });

  const rows = query.data ?? [];

  const stats = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    let info = 0;
    let resolved = 0;
    const bySource: Record<string, number> = {};
    const byCode: Record<string, number> = {};
    rows.forEach((r) => {
      if (r.resolved) resolved++;
      if (r.severity === "error") errors++;
      else if (r.severity === "warning") warnings++;
      else info++;
      bySource[r.source] = (bySource[r.source] || 0) + 1;
      const k = r.code || "—";
      byCode[k] = (byCode[k] || 0) + 1;
    });
    return { errors, warnings, info, resolved, bySource, byCode };
  }, [rows]);

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function markResolved(id: number, reason: string) {
    const { error } = await supabase
      .from("error_log" as never)
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
      } as never)
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return false;
    }
    // Anota motivo no JSONB context (best-effort)
    try {
      await supabase.rpc("annotate_error_log_resolution" as never, {
        p_ids: [id],
        p_reason: reason,
      } as never);
    } catch {
      /* ignore */
    }
    qc.invalidateQueries({ queryKey: ["error_log_today"] });
    qc.invalidateQueries({ queryKey: ["error_log"] });
    return true;
  }

  async function confirmResolve(row: ErrorLogRow) {
    const reason = window.prompt(
      `Confirmar correção de #${row.id}\n\n${row.code ?? row.source}: ${row.message.slice(0, 120)}\n\nDescreva o motivo/ação tomada:`,
      "verificado manualmente",
    );
    if (!reason) return;
    const ok = await markResolved(row.id, reason.trim());
    if (ok) toast({ title: "Marcado como resolvido", description: reason });
  }

  async function runHealthCheck() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("health-check", {
        body: { trigger: "manual-daily-panel" },
      });
      if (error) throw error;
      const f = (data as Record<string, unknown>)?.findings as unknown[] | undefined;
      const a = (data as Record<string, unknown>)?.applied as unknown[] | undefined;
      toast({
        title: "Verificação concluída",
        description: `${f?.length ?? 0} achado(s) · ${a?.length ?? 0} correção(ões) aplicada(s)`,
      });
      qc.invalidateQueries({ queryKey: ["error_log_today"] });
      qc.invalidateQueries({ queryKey: ["error_log"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Falha", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  async function reprocess(row: ErrorLogRow) {
    setReprocessing(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("health-check", {
        body: { trigger: "manual-reprocess", focus_code: row.code, focus_id: row.id },
      });
      if (error) throw error;
      const a = ((data as Record<string, unknown>)?.applied as unknown[]) ?? [];
      const ok = await markResolved(
        row.id,
        `Reprocessado via health-check (${a.length} correções aplicadas)`,
      );
      if (ok) {
        toast({
          title: "Reprocessado",
          description: `${a.length} correção(ões) aplicadas e item marcado como resolvido.`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Falha ao reprocessar", description: msg, variant: "destructive" });
    } finally {
      setReprocessing(null);
    }
  }

  async function applyFix(row: ErrorLogRow) {
    if (!row.code) return;
    const fixKey = KNOWN_FIXES[row.code];
    if (!fixKey) return;
    if (fixing) return;
    setFixing(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("health-check", {
        body: { fix: fixKey, trigger: "manual-fix-daily" },
      });
      if (error) throw error;
      const ok = (data as any)?.ok;
      const msg = ((data as any)?.message as string) ?? ((data as any)?.error as string);
      if (ok === false) throw new Error(msg || "Falha na correção");
      await markResolved(row.id, `Auto-correção aplicada: ${fixKey}`);
      toast({ title: "Correção aplicada", description: msg ?? "OK" });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      toast({ title: "Falha na correção", description: m, variant: "destructive" });
    } finally {
      setFixing(null);
    }
  }

  const todayLabel = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <section className="space-y-4 rounded-xl border-2 border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-destructive/10 p-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h3 className="text-base font-black">Erros do Dia</h3>
            <p className="text-xs text-muted-foreground capitalize flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {todayLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" size="sm" onClick={runHealthCheck} disabled={running}>
            <Activity className={`mr-1 h-4 w-4 ${running ? "animate-pulse" : ""}`} />
            {running ? "Verificando…" : "Verificar agora"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard label="Erros" value={stats.errors} tone="destructive" />
        <KpiCard label="Avisos" value={stats.warnings} tone="warning" />
        <KpiCard label="Info" value={stats.info} tone="muted" />
        <KpiCard label="Resolvidos" value={stats.resolved} tone="success" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "Todas as origens" : s}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "Todas severidades" : s}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          incluir resolvidos
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} registro(s)
        </span>
      </div>

      {/* Top códigos */}
      {Object.keys(stats.byCode).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(stats.byCode)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([k, n]) => (
              <Badge key={k} variant="outline" className="font-mono text-[11px]">
                {k} · {n}
              </Badge>
            ))}
        </div>
      )}

      {/* Lista */}
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-medium">Nenhum erro hoje ✓</p>
          <p className="text-xs text-muted-foreground">
            O sistema não registrou ocorrências para os filtros atuais.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const isOpen = expanded.has(r.id);
            const fixable = !!(r.code && KNOWN_FIXES[r.code]);
            const ctx = (r.context ?? {}) as Record<string, unknown>;
            const resolvedReason = ctx.resolved_reason as string | undefined;
            return (
              <li key={r.id} className="py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => toggleExpand(r.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <Badge
                        variant={
                          r.resolved
                            ? "secondary"
                            : r.severity === "error"
                              ? "destructive"
                              : "outline"
                        }
                        className="text-[10px]"
                      >
                        {r.resolved ? "resolvido" : r.severity}
                      </Badge>
                      <span className="font-mono text-muted-foreground">{r.source}</span>
                      {r.code && <span className="font-mono text-primary">{r.code}</span>}
                      <span className="text-muted-foreground">
                        {new Date(r.occurred_at).toLocaleTimeString("pt-BR")}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{r.message}</p>
                    {r.resolved && resolvedReason && (
                      <p className="mt-0.5 truncate text-[11px] italic text-emerald-600 dark:text-emerald-400">
                        ✓ {resolvedReason}
                      </p>
                    )}
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {fixable && !r.resolved && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => applyFix(r)}
                        disabled={fixing === r.id}
                      >
                        <Wrench className="mr-1 h-4 w-4" />
                        {fixing === r.id ? "Corrigindo…" : "Auto-corrigir"}
                      </Button>
                    )}
                    {!r.resolved && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reprocess(r)}
                          disabled={reprocessing === r.id}
                        >
                          <RefreshCw
                            className={`mr-1 h-4 w-4 ${reprocessing === r.id ? "animate-spin" : ""}`}
                          />
                          {reprocessing === r.id ? "Reprocessando…" : "Reprocessar"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => confirmResolve(r)}>
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Confirmar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed">
                    {safeStringifyContext(r.context)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "destructive" | "warning" | "muted" | "success";
}) {
  const toneClasses: Record<typeof tone, string> = {
    destructive: "border-destructive/30 bg-destructive/10 text-destructive",
    warning:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    muted: "border-border bg-muted/40 text-muted-foreground",
    success:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  };
  return (
    <div className={`rounded-lg border p-3 ${toneClasses[tone]}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}
