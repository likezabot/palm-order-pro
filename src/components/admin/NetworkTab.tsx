import { useEffect, useRef, useState, useCallback } from "react";
import { Activity, Printer, Cloud, Wifi, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConnectivity } from "@/hooks/use-connectivity";
import { supabase } from "@/integrations/supabase/client";
import { loadPrintConfig } from "@/lib/print-config";

/** Deriva URL base da bridge a partir do bridgeUrl salvo (que termina em /print). */
function getBridgeBaseUrl(): string {
  try {
    const cfg = loadPrintConfig();
    const raw = (cfg.bridgeUrl ?? "").trim();
    if (!raw) return "http://localhost:9100";
    return raw.replace(/\/print\/?$/, "").replace(/\/$/, "");
  } catch {
    return "http://localhost:9100";
  }
}

const HISTORY_SIZE = 20;
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 3_000;

type Source = "printer" | "server" | "internet";

interface Measurement {
  ts: number;
  latency: number | null; // null = falha/offline
}

interface PrinterMeta {
  printerCount: number | null;
  printerOk: boolean | null;
}

function classifyLatency(latency: number | null): "ok" | "warn" | "bad" {
  if (latency == null) return "bad";
  if (latency < 200) return "ok";
  if (latency < 800) return "warn";
  return "bad";
}

function colorClass(level: "ok" | "warn" | "bad") {
  if (level === "ok") return "text-success";
  if (level === "warn") return "text-warning";
  return "text-destructive";
}

function bgClass(level: "ok" | "warn" | "bad") {
  if (level === "ok") return "bg-success";
  if (level === "warn") return "bg-warning";
  return "bg-destructive";
}

async function pingPrinter(): Promise<{ latency: number | null; meta: PrinterMeta }> {
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${getBridgeBaseUrl()}/health`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
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
  } catch {
    return null;
  }
}

async function pingInternet(): Promise<number | null> {
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    await fetch("https://www.google.com/generate_204", {
      mode: "no-cors",
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  }
}

function Sparkline({ data, level }: { data: Measurement[]; level: "ok" | "warn" | "bad" }) {
  if (data.length < 2) {
    return <div className="h-8 flex items-center text-xs text-muted-foreground">Coletando dados…</div>;
  }
  const values = data.map((d) => d.latency ?? 1500);
  const max = Math.max(...values, 100);
  const min = 0;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const v = d.latency ?? max;
      const y = 30 - ((v - min) / (max - min || 1)) * 28 - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const strokeColor =
    level === "ok" ? "hsl(var(--success))" : level === "warn" ? "hsl(var(--warning))" : "hsl(var(--destructive))";

  return (
    <svg viewBox="0 0 100 30" className="w-full h-8" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
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
}

function StatusCard({ title, icon, history, onTestNow, testing, extraStatus, forceLevel }: StatusCardProps) {
  const last = history[history.length - 1];
  const latency = last?.latency ?? null;
  const level = forceLevel ?? classifyLatency(latency);
  const isOnline = latency != null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${bgClass(level)}`} />
            <Badge variant="outline" className={colorClass(level)}>
              {isOnline ? "Online" : "Offline"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className={`text-2xl font-bold tabular-nums ${colorClass(level)}`}>
              {isOnline ? `${latency} ms` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {last ? `Última: ${new Date(last.ts).toLocaleTimeString()}` : "Sem medições"}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={onTestNow} disabled={testing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${testing ? "animate-spin" : ""}`} />
            Testar
          </Button>
        </div>

        <Sparkline data={history} level={level} />

        {extraStatus && <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">{extraStatus}</div>}
      </CardContent>
    </Card>
  );
}

export default function NetworkTab() {
  const [printerHistory, setPrinterHistory] = useState<Measurement[]>([]);
  const [serverHistory, setServerHistory] = useState<Measurement[]>([]);
  const [internetHistory, setInternetHistory] = useState<Measurement[]>([]);
  const [printerMeta, setPrinterMeta] = useState<PrinterMeta>({ printerCount: null, printerOk: null });
  const [testing, setTesting] = useState<Source | null>(null);
  const conn = useConnectivity();
  const mounted = useRef(true);

  const push = useCallback((src: Source, m: Measurement) => {
    const setter =
      src === "printer" ? setPrinterHistory : src === "server" ? setServerHistory : setInternetHistory;
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

  const runAll = useCallback(async () => {
    const [{ latency: pl, meta }, sl, il] = await Promise.all([pingPrinter(), pingServer(), pingInternet()]);
    if (!mounted.current) return;
    const ts = Date.now();
    push("printer", { ts, latency: pl });
    push("server", { ts, latency: sl });
    push("internet", { ts, latency: il });
    setPrinterMeta(meta);
  }, [push]);

  useEffect(() => {
    mounted.current = true;
    runAll();
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (document.visibilityState === "visible") runAll();
      }, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        runAll();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mounted.current = false;
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [runAll]);

  // Conexão (Network Information API)
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number };
  };
  const effectiveType = nav.connection?.effectiveType ?? "—";
  const navOnline = navigator.onLine;

  // Realtime info
  const heartbeatAgo = conn.lastRealtimeHeartbeat
    ? Math.round((Date.now() - conn.lastRealtimeHeartbeat) / 1000)
    : null;

  const realtimeLevel: "ok" | "warn" | "bad" =
    conn.realtime === "online" ? "ok" : conn.realtime === "degraded" ? "warn" : "bad";

  // Server card combina latência + realtime
  const serverLast = serverHistory[serverHistory.length - 1];
  const serverLatencyLevel = classifyLatency(serverLast?.latency ?? null);
  // pior caso entre latência http e estado do realtime
  const serverLevel: "ok" | "warn" | "bad" =
    serverLatencyLevel === "bad" || realtimeLevel === "bad"
      ? "bad"
      : serverLatencyLevel === "warn" || realtimeLevel === "warn"
      ? "warn"
      : "ok";

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Status de Rede
          </h2>
          <p className="text-sm text-muted-foreground">
            Atualiza a cada 5 segundos. Pausado quando a aba não está visível.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard
          title="Impressora (ponte)"
          icon={<Printer className="w-4 h-4" />}
          history={printerHistory}
          testing={testing === "printer"}
          onTestNow={runPrinter}
          extraStatus={
            <>
              <div>
                Endpoint: <code className="font-mono">localhost:9100/health</code>
              </div>
              <div>
                Impressoras detectadas:{" "}
                <span className="font-medium text-foreground">
                  {printerMeta.printerCount != null ? printerMeta.printerCount : "—"}
                </span>
              </div>
            </>
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
              <div>
                Realtime:{" "}
                <span className={`font-medium ${colorClass(realtimeLevel)}`}>
                  {conn.realtime.toUpperCase()}
                </span>
              </div>
              <div>
                Último heartbeat:{" "}
                <span className="font-medium text-foreground">
                  {heartbeatAgo != null ? `${heartbeatAgo}s atrás` : "—"}
                </span>
              </div>
            </>
          }
        />

        <StatusCard
          title="Internet (PC/tablet)"
          icon={<Wifi className="w-4 h-4" />}
          history={internetHistory}
          testing={testing === "internet"}
          onTestNow={runInternet}
          extraStatus={
            <>
              <div>
                navigator.onLine:{" "}
                <span className={`font-medium ${navOnline ? "text-success" : "text-destructive"}`}>
                  {navOnline ? "true" : "false"}
                </span>
              </div>
              <div>
                Tipo de conexão: <span className="font-medium text-foreground">{effectiveType}</span>
              </div>
            </>
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Legenda</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-success" /> Latência &lt; 200ms — saudável
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-warning" /> 200–800ms — degradado
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-destructive" /> &gt; 800ms ou offline
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
