import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, CheckCircle2, Trash2, Filter, Activity, Wrench } from "lucide-react";
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

const SOURCES = ["all", "global", "console", "fetch", "xhr", "rpc", "webusb", "public_checkout", "public_menu", "pdv", "kitchen", "palm", "admin", "bridge", "realtime", "print", "other"] as const;
const SEVERITIES = ["all", "error", "warning", "info"] as const;

// Códigos que têm correção pontual conhecida disparada via /functions/v1/health-check?fix=...
const KNOWN_FIXES: Record<string, string> = {
  function_not_unique: "function_not_unique",
};

export default function ErrorLogPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showResolved, setShowResolved] = useState(false);
  const [source, setSource] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["error_log", source, severity, showResolved],
    queryFn: async () => {
      let q = supabase
        .from("error_log" as never)
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (!showResolved) q = q.eq("resolved", false);
      if (source !== "all") q = q.eq("source", source);
      if (severity !== "all") q = q.eq("severity", severity);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ErrorLogRow[];
    },
    refetchInterval: 30_000,
  });

  // Último resumo do health-check (para banner)
  const healthQuery = useQuery({
    queryKey: ["error_log_health"],
    queryFn: async () => {
      const { data } = await supabase
        .from("error_log" as never)
        .select("*")
        .eq("code", "health_check_summary")
        .order("occurred_at", { ascending: false })
        .limit(1);
      return ((data ?? [])[0] ?? null) as unknown as ErrorLogRow | null;
    },
    refetchInterval: 60_000,
  });

  const rows = query.data ?? [];

  const counts = useMemo(() => {
    const byCode: Record<string, number> = {};
    rows.forEach((r) => {
      const k = `${r.source}:${r.code || "—"}`;
      byCode[k] = (byCode[k] || 0) + 1;
    });
    return byCode;
  }, [rows]);

  async function markResolved(id: number) {
    const { error } = await supabase
      .from("error_log" as never)
      .update({ resolved: true, resolved_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["error_log"] });
  }

  async function clearOld() {
    if (!confirm("Apagar erros com mais de 7 dias?")) return;
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("error_log" as never).delete().lt("occurred_at", cutoff);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Limpeza concluída", description: "Erros antigos removidos." });
    qc.invalidateQueries({ queryKey: ["error_log"] });
  }

  async function runHealthCheck() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("health-check", {
        body: { trigger: "manual" },
      });
      if (error) throw error;
      const f = (data as any)?.findings ?? [];
      const a = (data as any)?.applied ?? [];
      toast({
        title: "Verificação concluída",
        description: `${f.length} achado(s) · ${a.length} correção(ões) aplicada(s)`,
      });
      qc.invalidateQueries({ queryKey: ["error_log"] });
      qc.invalidateQueries({ queryKey: ["error_log_health"] });
    } catch (e: any) {
      toast({ title: "Falha", description: e?.message ?? "Erro ao rodar verificação", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  async function applyFix(code: string) {
    const fixKey = KNOWN_FIXES[code];
    if (!fixKey) return;
    if (fixing) return; // debounce/duplo-clique
    setFixing(code);
    try {
      const { data, error } = await supabase.functions.invoke("health-check", {
        body: { fix: fixKey, trigger: "manual-fix" },
      });
      if (error) throw error;
      const ok = (data as any)?.ok;
      const msg = (data as any)?.message ?? (data as any)?.error;
      if (ok === false) throw new Error(msg || "Falha na correção");
      toast({ title: "Correção aplicada", description: msg ?? "OK" });
      qc.invalidateQueries({ queryKey: ["error_log"] });
    } catch (e: any) {
      toast({ title: "Falha na correção", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setFixing(null);
    }
  }

  const health = healthQuery.data;
  const healthCtx = (health?.context ?? {}) as any;
  const healthErrors = Number(healthCtx?.errors ?? 0);
  const healthWarn = Number(healthCtx?.warnings ?? 0);
  const healthOk = health && healthErrors === 0 && healthWarn === 0;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <h3 className="text-base font-bold">Erros do sistema</h3>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" size="sm" onClick={runHealthCheck} disabled={running}>
            <Activity className={`mr-1 h-4 w-4 ${running ? "animate-pulse" : ""}`} />
            {running ? "Verificando…" : "Rodar verificação"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={clearOld}>
            <Trash2 className="mr-1 h-4 w-4" /> Limpar antigos (&gt;7d)
          </Button>
        </div>
      </header>

      {/* Banner de saúde */}
      {health && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${
            healthOk
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : healthErrors > 0
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          <div>
            <strong>{healthOk ? "Sistema saudável ✓" : "Alertas detectados"}</strong>
            {!healthOk && (
              <span className="ml-2 text-xs">
                {healthErrors} erro(s) · {healthWarn} aviso(s)
              </span>
            )}
          </div>
          <span className="text-xs opacity-80">
            última verificação: {new Date(health.occurred_at).toLocaleString("pt-BR")}
          </span>
        </div>
      )}

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
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          incluir resolvidos
        </label>
      </div>

      {Object.keys(counts).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([k, n]) => (
              <Badge key={k} variant="outline" className="font-mono text-[11px]">
                {k} · {n}
              </Badge>
            ))}
        </div>
      )}

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum erro registrado ✓</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const isOpen = expanded === r.id;
            const fixable = r.code && KNOWN_FIXES[r.code];
            return (
              <li key={r.id} className="py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant={r.resolved ? "secondary" : r.severity === "error" ? "destructive" : "outline"} className="text-[10px]">
                        {r.severity}
                      </Badge>
                      <span className="font-mono text-muted-foreground">{r.source}</span>
                      {r.code && <span className="font-mono text-primary">{r.code}</span>}
                      <span className="text-muted-foreground">
                        {new Date(r.occurred_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{r.message}</p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {fixable && !r.resolved && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => applyFix(r.code!)}
                        disabled={fixing === r.code}
                      >
                        <Wrench className="mr-1 h-4 w-4" />
                        {fixing === r.code ? "Corrigindo…" : "Auto-corrigir"}
                      </Button>
                    )}
                    {!r.resolved && (
                      <Button size="sm" variant="ghost" onClick={() => markResolved(r.id)}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Resolver
                      </Button>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed">
                    {JSON.stringify(r.context ?? {}, null, 2)}
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
