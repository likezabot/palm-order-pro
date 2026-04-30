import { useEffect, useRef, useState, useCallback } from "react";
import { Activity, Printer, Cloud, Wifi, RefreshCw, Inbox, AlertCircle, Smartphone, Monitor, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConnectivity } from "@/hooks/use-connectivity";
import { supabase } from "@/integrations/supabase/client";
import { loadPrintConfig } from "@/lib/print-config";

/* ========= Detecção de contexto ========= */
type Context = "electron" | "desktop-browser" | "mobile" | "preview";

function detectContext(): Context {
  const ua = navigator.userAgent || "";
  // Lovable preview iframe
  if (window.location.hostname.includes("lovable.app") || window.location.hostname.includes("lovableproject.com")) {
    return "preview";
  }
  // Electron
  if (/Electron/i.test(ua) || (window as any).process?.versions?.electron) {
    return "electron";
  }
  // Mobile (heurística: touch + tela estreita)
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || window.innerWidth < 768) {
    return "mobile";
  }
  return "desktop-browser";
}

/** Deriva URL base da bridge a partir do bridgeUrl salvo. */
function getBridgeBaseUrl(): string {
  try {
    const cfg = loadPrintConfig();
    const raw = (cfg.bridgeUrl ?? "").trim();
    if (!raw) return "http://127.0.0.1:3001";
    return raw.replace(/\/print\/?$/, "").replace(/\/$/, "");
  } catch {
    return "http://127.0.0.1:3001";
  }
}

const HISTORY_SIZE = 20;
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 3_000;

type Source = "printer" | "server" | "internet";

interface Measurement { ts: number; latency: number | null; }
interface PrinterMeta { printerCount: number | null; printerOk: boolean | null; }

function classifyLatency(latency: number | null): "ok" | "warn" | "bad" {
  if (latency == null) return "bad";
  if (latency < 200) return "ok";
  if (latency < 800) return "warn";
  return "bad";
}
const colorClass = (l: "ok"|"warn"|"bad") => l === "ok" ? "text-success" : l === "warn" ? "text-warning" : "text-destructive";
const bgClass = (l: "ok"|"warn"|"bad") => l === "ok" ? "bg-success" : l === "warn" ? "bg-warning" : "bg-destructive";

async function pingPrinter(): Promise<{ latency: number | null; meta: PrinterMeta }> {
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${getBridgeBaseUrl()}/health`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    const latency = Math.round(performance.now() - t0);
    let meta: PrinterMeta = { printerCount: null, printerOk: null };
    try {
      const body = await res.json();
      meta = {
        printerCount: typeof body?.printerCount === "number" ? body.printerCount : (Array.isArray(body?.printers) ? body.printers.length : null),
        printerOk: typeof body?.ok === "boolean" ? body.ok : res.ok,
      };
    } catch {
      meta = { printerCount: null, printerOk: res.ok };
    }
    return { latency: res.ok ? latency : null, meta };
  } catch {
    return { latency: null, meta: { printerCount: null, printerOk: false } };
  }
}

async function pingServer(): Promise<number | null> {
  const t0 = performance.now();
  try {
    const { error } = await supabase.from("settings").select("key").limit(1);
    if (error) return null;
    return Math.round(performance.now() - t0);
  } catch { return null; }
}

async function pingInternet(): Promise<number | null> {
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    await fetch("https://www.google.com/generate_204", { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
    clearTimeout(timer);
    return Math.round(performance.now() - t0);
  } catch { return null; }
}

function Sparkline({ data, level }: { data: Measurement[]; level: "ok" | "warn" | "bad" }) {
  if (data.length < 2) return <div className="h-8 flex items-center text-xs text-muted-foreground">Coletando dados…</div>;
  const values = data.map((d) => d.latency ?? 1500);
  const max = Math.max(...values, 100);
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const v = d.latency ?? max;
    const y = 30 - ((v) / (max || 1)) * 28 - 1;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const stroke = level === "ok" ? "hsl(var(--success))" : level === "warn" ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  return (
    <svg viewBox="0 0 100 30" className="w-full h-8" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface StatusCardProps {
  title: string;
  icon: React.ReactNode;
  history: Measurement[];
  onTestNow: () => void;
  testing: boolean;
  extraStatus?: React.ReactNode;
  forceLevel?: "ok" | "warn" | "bad";
  onlineLabel?: string;
  offlineLabel?: string;
  hideMetric?: boolean;
}

function StatusCard({ title, icon, history, onTestNow, testing, extraStatus, forceLevel, onlineLabel = "Online", offlineLabel = "Offline", hideMetric }: StatusCardProps) {
  const last = history[history.length - 1];
  const latency = last?.latency ?? null;
  const level = forceLevel ?? classifyLatency(latency);
  const isOnline = latency != null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">{icon}{title}</CardTitle>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${bgClass(level)}`} />
            <Badge variant="outline" className={colorClass(level)}>{isOnline ? onlineLabel : offlineLabel}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hideMetric && (
          <div className="flex items-baseline justify-between">
            <div>
              <div className={`text-2xl font-bold tabular-nums ${colorClass(level)}`}>{isOnline ? `${latency} ms` : "—"}</div>
              <div className="text-xs text-muted-foreground">{last ? `Última: ${new Date(last.ts).toLocaleTimeString()}` : "Sem medições"}</div>
            </div>
            <Button size="sm" variant="outline" onClick={onTestNow} disabled={testing}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${testing ? "animate-spin" : ""}`} />
              Testar
            </Button>
          </div>
        )}
        {!hideMetric && <Sparkline data={history} level={level} />}
        {extraStatus && <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">{extraStatus}</div>}
      </CardContent>
    </Card>
  );
}

/* ========= Painel: Fila de Impressão (print_jobs) ========= */
interface JobsStats {
  queued: number;
  printing: number;
  failed: number;
  lastPrinted: { table_name: string | null; printed_at: string } | null;
  lastError: string | null;
}

function PrintJobsPanel() {
  const [stats, setStats] = useState<JobsStats | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: counts }, { data: lastPrinted }, { data: lastFailed }] = await Promise.all([
        supabase.from("print_jobs").select("status").in("status", ["queued", "printing", "failed"]),
        supabase
          .from("print_jobs")
          .select("printed_at, orders(table_name)")
          .eq("status", "printed")
          .order("printed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("print_jobs")
          .select("last_error")
          .eq("status", "failed")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const c = { queued: 0, printing: 0, failed: 0 };
      for (const r of counts ?? []) {
        const s = (r as any).status as keyof typeof c;
        if (s in c) c[s]++;
      }
      setStats({
        queued: c.queued,
        printing: c.printing,
        failed: c.failed,
        lastPrinted: lastPrinted
          ? {
              table_name: ((lastPrinted as any).orders?.table_name as string) ?? null,
              printed_at: (lastPrinted as any).printed_at,
            }
          : null,
        lastError: (lastFailed as any)?.last_error ?? null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`print-jobs-stats-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "print_jobs" }, () => refresh())
      .subscribe();
    const t = setInterval(refresh, 15_000);
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, [refresh]);

  const formatAgo = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `há ${diff}s`;
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    return `há ${Math.floor(diff / 3600)} h`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="w-4 h-4 text-primary" /> Fila de Impressão (print_jobs)
          </CardTitle>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Fila" value={stats?.queued ?? "—"} cls="text-warning" />
          <Stat label="Imprimindo" value={stats?.printing ?? "—"} cls="text-blue-400" />
          <Stat label="Falhas" value={stats?.failed ?? "—"} cls="text-destructive" />
          <Stat
            label="Última impressão"
            value={stats?.lastPrinted ? `Mesa ${stats.lastPrinted.table_name ?? "?"}` : "—"}
            sub={stats?.lastPrinted ? formatAgo(stats.lastPrinted.printed_at) : undefined}
            cls="text-success"
          />
        </div>
        {stats?.lastError && (
          <div className="mt-3 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-2 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div><strong>Último erro:</strong> {stats.lastError}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub, cls }: { label: string; value: any; sub?: string; cls?: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 border border-border">
      <div className="text-[10px] uppercase font-bold text-muted-foreground">{label}</div>
      <div className={`text-xl font-black tabular-nums ${cls ?? "text-foreground"}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ========= Aviso contextual da bridge ========= */
function ContextNotice({ ctx }: { ctx: Context }) {
  if (ctx === "electron") return null;
  if (ctx === "desktop-browser") {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="py-3 text-sm flex items-start gap-3">
          <Monitor className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-foreground">Navegador no PC</div>
            <div className="text-muted-foreground text-xs mt-0.5">
              Se a bridge local não responder, abra o app desktop (.exe) no PC da impressora. O navegador
              só consegue ver a bridge se estiver no mesmo PC.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (ctx === "mobile") {
    return (
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="py-3 text-sm flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-foreground">Celular / tablet</div>
            <div className="text-muted-foreground text-xs mt-0.5">
              "Bridge offline" aqui <strong>não é erro</strong>. O celular não consegue acessar
              <code className="mx-1 px-1 bg-muted rounded">localhost</code>. A impressão acontece no PC do caixa
              via fila <code className="mx-1 px-1 bg-muted rounded">print_jobs</code>. Para testar manualmente,
              configure o IP do PC, ex: <code className="ml-1 px-1 bg-muted rounded">http://192.168.x.x:3001</code>.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  // preview
  return (
    <Card className="border-muted bg-muted/30">
      <CardContent className="py-3 text-sm flex items-start gap-3">
        <Globe className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <div className="font-bold text-foreground">Preview Lovable</div>
          <div className="text-muted-foreground text-xs mt-0.5">
            O preview não consegue validar a bridge local do PC. Teste a impressão no app publicado
            ou no app desktop instalado.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ========= Componente principal ========= */
export default function NetworkTab() {
  const [printerHistory, setPrinterHistory] = useState<Measurement[]>([]);
  const [serverHistory, setServerHistory] = useState<Measurement[]>([]);
  const [internetHistory, setInternetHistory] = useState<Measurement[]>([]);
  const [printerMeta, setPrinterMeta] = useState<PrinterMeta>({ printerCount: null, printerOk: null });
  const [testing, setTesting] = useState<Source | null>(null);
  const conn = useConnectivity();
  const mounted = useRef(true);
  const [ctx] = useState<Context>(() => detectContext());

  const push = useCallback((src: Source, m: Measurement) => {
    const setter = src === "printer" ? setPrinterHistory : src === "server" ? setServerHistory : setInternetHistory;
    setter((prev) => {
      const next = [...prev, m];
      return next.length > HISTORY_SIZE ? next.slice(next.length - HISTORY_SIZE) : next;
    });
  }, []);

  const runPrinter = useCallback(async () => {
    setTesting("printer");
    const { latency, meta } = await pingPrinter();
    if (!mounted.current) return;
    push("printer", { ts: Date.now(), latency });
    setPrinterMeta(meta);
    setTesting(null);
  }, [push]);

  const runServer = useCallback(async () => {
    setTesting("server");
    const latency = await pingServer();
    if (!mounted.current) return;
    push("server", { ts: Date.now(), latency });
    setTesting(null);
  }, [push]);

  const runInternet = useCallback(async () => {
    setTesting("internet");
    const latency = await pingInternet();
    if (!mounted.current) return;
    push("internet", { ts: Date.now(), latency });
    setTesting(null);
  }, [push]);

  const shouldPingPrinter = ctx === "electron" || ctx === "desktop-browser";

  const runAll = useCallback(async () => {
    const tasks: Promise<any>[] = [pingServer(), pingInternet()];
    if (shouldPingPrinter) tasks.unshift(pingPrinter());
    const results = await Promise.all(tasks);
    if (!mounted.current) return;
    const ts = Date.now();
    if (shouldPingPrinter) {
      const { latency: pl, meta } = results[0] as { latency: number | null; meta: PrinterMeta };
      push("printer", { ts, latency: pl });
      setPrinterMeta(meta);
    }
    const sl = results[shouldPingPrinter ? 1 : 0] as number | null;
    const il = results[shouldPingPrinter ? 2 : 1] as number | null;
    push("server", { ts, latency: sl });
    push("internet", { ts, latency: il });
  }, [push, shouldPingPrinter]);

  useEffect(() => {
    mounted.current = true;
    runAll();
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(() => { if (document.visibilityState === "visible") runAll(); }, POLL_INTERVAL_MS);
    };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const onVis = () => { if (document.visibilityState === "visible") { runAll(); start(); } else stop(); };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => { mounted.current = false; stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [runAll]);

  const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
  const effectiveType = nav.connection?.effectiveType ?? "—";
  const navOnline = navigator.onLine;
  const heartbeatAgo = conn.lastRealtimeHeartbeat ? Math.round((Date.now() - conn.lastRealtimeHeartbeat) / 1000) : null;
  const realtimeLevel: "ok" | "warn" | "bad" = conn.realtime === "online" ? "ok" : conn.realtime === "degraded" ? "warn" : "bad";
  const serverLast = serverHistory[serverHistory.length - 1];
  const serverLatencyLevel = classifyLatency(serverLast?.latency ?? null);
  const serverLevel: "ok"|"warn"|"bad" =
    serverLatencyLevel === "bad" || realtimeLevel === "bad" ? "bad"
    : serverLatencyLevel === "warn" || realtimeLevel === "warn" ? "warn"
    : "ok";

  const ctxLabel: Record<Context, string> = {
    electron: "App desktop (.exe)",
    "desktop-browser": "Navegador no PC",
    mobile: "Celular / tablet",
    preview: "Preview Lovable",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Status de Rede
          </h2>
          <p className="text-sm text-muted-foreground">Atualiza a cada 5s. Pausado quando a aba não está visível.</p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">Contexto: {ctxLabel[ctx]}</Badge>
      </div>

      <ContextNotice ctx={ctx} />

      <PrintJobsPanel />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard
          title="Bridge local (.exe)"
          icon={<Printer className="w-4 h-4" />}
          history={printerHistory}
          testing={testing === "printer"}
          onTestNow={runPrinter}
          hideMetric={!shouldPingPrinter}
          onlineLabel={shouldPingPrinter ? "Online" : "N/A"}
          offlineLabel={shouldPingPrinter ? "Offline" : "N/A"}
          forceLevel={!shouldPingPrinter ? "warn" : undefined}
          extraStatus={
            shouldPingPrinter ? (
              <>
                <div>Endpoint: <code className="font-mono">{getBridgeBaseUrl().replace(/^https?:\/\//, "")}/health</code></div>
                <div>Impressoras detectadas: <span className="font-medium text-foreground">{printerMeta.printerCount != null ? printerMeta.printerCount : "—"}</span></div>
              </>
            ) : (
              <div>
                Não testado neste contexto. A bridge só roda no PC com o app desktop.
                A impressão acontece via fila <code className="font-mono">print_jobs</code> consumida pelo .exe.
              </div>
            )
          }
        />

        <StatusCard
          title="Servidor (Cloud)"
          icon={<Cloud className="w-4 h-4" />}
          history={serverHistory}
          testing={testing === "server"}
          onTestNow={runServer}
          forceLevel={serverLevel}
          extraStatus={
            <>
              <div>Realtime: <span className={`font-medium ${colorClass(realtimeLevel)}`}>{conn.realtime.toUpperCase()}</span></div>
              <div>Último heartbeat: <span className="font-medium text-foreground">{heartbeatAgo != null ? `${heartbeatAgo}s atrás` : "—"}</span></div>
            </>
          }
        />

        <StatusCard
          title="Internet"
          icon={<Wifi className="w-4 h-4" />}
          history={internetHistory}
          testing={testing === "internet"}
          onTestNow={runInternet}
          extraStatus={
            <>
              <div>navigator.onLine: <span className={`font-medium ${navOnline ? "text-success" : "text-destructive"}`}>{navOnline ? "true" : "false"}</span></div>
              <div>Tipo: <span className="font-medium text-foreground">{effectiveType}</span></div>
            </>
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Legenda</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-success" /> &lt; 200ms — saudável</div>
          <div className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-warning" /> 200–800ms — degradado</div>
          <div className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-destructive" /> &gt; 800ms ou offline</div>
        </CardContent>
      </Card>
    </div>
  );
}
