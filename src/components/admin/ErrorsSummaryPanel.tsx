import { useEffect, useState } from "react";
import { RefreshCw, BarChart3, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type CodeRow = { code: string; count: number; last_seen: string; first_seen: string; sources: string[] };
type SourceRow = { source: string; count: number };
type MessageRow = { message: string; count: number; severity: string; source: string };

type Summary = {
  summary_date: string;
  generated_at: string;
  total_unresolved: number;
  total_today: number;
  by_severity: Record<string, number>;
  by_source: SourceRow[];
  by_code: CodeRow[];
  top_messages: MessageRow[];
};

export const ErrorsSummaryPanel = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("error_log_daily_summary" as never)
      .select("*")
      .order("summary_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) setSummary(data as unknown as Summary);
    setLoading(false);
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const { data, error } = await supabase.rpc("build_error_log_daily_summary" as never);
      if (error) throw error;
      setSummary(data as unknown as Summary);
      toast({ title: "Resumo atualizado", description: `${(data as Summary)?.total_unresolved ?? 0} erros não resolvidos` });
    } catch (e) {
      toast({ variant: "destructive", title: "Falha ao gerar resumo", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="rounded-xl border-2 border-border p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-black text-lg text-foreground">Resumo diário de erros</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Agregado de erros não resolvidos por código e origem. Atualizado diariamente às 03:30.
            {summary?.generated_at && (
              <> Última atualização: <b>{new Date(summary.generated_at).toLocaleString("pt-BR")}</b>.</>
            )}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={regenerate} disabled={regenerating || loading}>
          <RefreshCw className={`w-4 h-4 ${regenerating ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {!summary ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {loading ? "Carregando…" : "Nenhum resumo disponível. Clique em atualizar."}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <KPI label="Não resolvidos" value={summary.total_unresolved} tone="destructive" />
            <KPI label="Hoje" value={summary.total_today} tone="primary" />
            <KPI label="Erros" value={summary.by_severity?.error ?? 0} tone="destructive" />
            <KPI label="Avisos" value={summary.by_severity?.warning ?? 0} tone="warning" />
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Top códigos</h4>
            {summary.by_code?.length ? (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {summary.by_code.slice(0, 12).map((r) => (
                  <div key={r.code} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                    <Badge variant="destructive" className="font-mono shrink-0">{r.count}</Badge>
                    <span className="font-mono font-semibold truncate flex-1">{r.code}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {r.sources?.slice(0, 2).join(", ")}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(r.last_seen).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum código pendente. 🎉</p>
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Por origem</h4>
            <div className="flex flex-wrap gap-1.5">
              {summary.by_source?.map((s) => (
                <Badge key={s.source} variant="outline" className="font-mono">
                  {s.source} · {s.count}
                </Badge>
              ))}
            </div>
          </div>

          {summary.top_messages?.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Mensagens mais frequentes</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {summary.top_messages.slice(0, 6).map((m, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-destructive shrink-0" />
                    <span className="flex-1 break-words">{m.message}</span>
                    <Badge variant="secondary" className="shrink-0">{m.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const KPI = ({ label, value, tone }: { label: string; value: number; tone: "destructive" | "primary" | "warning" }) => {
  const toneClass =
    tone === "destructive" ? "border-destructive/40 bg-destructive/5 text-destructive"
    : tone === "warning" ? "border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400"
    : "border-primary/40 bg-primary/5 text-primary";
  return (
    <div className={`rounded-lg border-2 p-3 ${toneClass}`}>
      <div className="text-2xl font-black leading-none">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide mt-1 opacity-80">{label}</div>
    </div>
  );
};

export default ErrorsSummaryPanel;
