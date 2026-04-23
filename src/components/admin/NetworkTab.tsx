import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Activity,
  Printer,
  Cloud,
  Wifi,
  RefreshCw,
  Pencil,
  Check,
  X,
  Smartphone,
  Tablet,
  Monitor,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useConnectivity } from "@/hooks/use-connectivity";
import { supabase } from "@/integrations/supabase/client";
import {
  getDeviceType,
  getDeviceTypeLabel,
  getDeviceFriendlyName,
  setDeviceFriendlyName,
  getCurrentRole,
  roleUsesPrinter,
  type DeviceType,
} from "@/lib/device-info";
import { cn } from "@/lib/utils";

const HISTORY_SIZE = 30;
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 3_000;

type Source = "printer" | "server" | "internet";
type Level = "ok" | "warn" | "bad";

interface Measurement {
  ts: number;
  latency: number | null;
}

interface PrinterMeta {
  printerCount: number | null;
  printerOk: boolean | null;
}

function classifyLatency(latency: number | null): Level {
  if (latency == null) return "bad";
  if (latency < 200) return "ok";
  if (latency < 800) return "warn";
  return "bad";
}

const LEVEL_TEXT: Record<Level, string> = {
  ok: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
};
const LEVEL_BG_SOFT: Record<Level, string> = {
  ok: "bg-success/5 border-success/20",
  warn: "bg-warning/5 border-warning/20",
  bad: "bg-destructive/5 border-destructive/20",
};
const LEVEL_DOT: Record<Level, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
};
const LEVEL_LABEL_INTERNET: Record<Level, string> = { ok: "Boa", warn: "Lenta", bad: "Sem conexão" };
const LEVEL_LABEL_SERVER: Record<Level, string> = { ok: "Online", warn: "Devagar", bad: "Sem resposta" };
const LEVEL_LABEL_PRINTER: Record<Level, string> = { ok: "Funcionando", warn: "Lenta", bad: "Desligada" };

async function pingPrinter(): Promise<{ latency: number | null; meta: PrinterMeta }> {
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch("http://localhost:9100/health", { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    const latency = Math.round(performance.now() - t0);
    let meta: PrinterMeta = { printerCount: null, printerOk: null };
    try {
      const body = await res.json();
      meta = {
        printerCount:
          typeof body?.printerCount === "number"
            ? body.printerCount
            : Array.isArray(body?.printers)
            ? body.printers.length
            : null,
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

function average(history: Measurement[]): number | null {
  const valid = history.map((m) => m.latency).filter((v): v is number => typeof v === "number");
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function offlineSince(history: Measurement[]): number | null {
  // procura a última medição "ok" e retorna o ts da próxima falha
  if (!history.length) return null;
  const last = history[history.length - 1];
  if (last.latency != null) return null;
  let firstFail = last.ts;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].latency == null) firstFail = history[i].ts;
    else break;
  }
  return firstFail;
}

function formatSince(ts: number | null): string {
  if (!ts) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.round(m / 60);
  return `há ${h}h`;
}

function Sparkline({ data, level }: { data: Measurement[]; level: Level }) {
  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2, 9)}`, []);
  if (data.length < 2) {
    return (
      <div className="h-10 flex items-center justify-center text-[10px] text-muted-foreground/60">
        Coletando dados…
      </div>
    );
  }
  const values = data.map((d) => d.latency);
  const numeric = values.filter((v): v is number => typeof v === "number");
  const max = Math.max(...numeric, 100) * 1.1;
  const min = Math.min(...numeric, 0);
  const range = Math.max(max - min, 1);
  const W = 100;
  const H = 40;

  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const v = d.latency ?? max; // falha = topo
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return { x, y, isNull: d.latency == null };
  });

  const linePoints = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const areaPoints = `0,${H} ${linePoints} ${W},${H}`;

  const colorVar =
    level === "ok" ? "--success" : level === "warn" ? "--warning" : "--destructive";
  const stroke = `hsl(var(${colorVar}))`;
  const fillStart = `hsl(var(${colorVar}) / 0.35)`;
  const fillEnd = `hsl(var(${colorVar}) / 0)`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillStart} />
          <stop offset="100%" stopColor={fillEnd} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${id})`} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

interface MetricCardProps {
  title: string;
  icon: React.ReactNode;
  level: Level;
  statusLabel: string;
  latency: number | null;
  history: Measurement[];
  description: string;
  footerLine: string;
  onTest: () => void;
  testing: boolean;
}

function MetricCard({
  title,
  icon,
  level,
  statusLabel,
  latency,
  history,
  description,
  footerLine,
  onTest,
  testing,
}: MetricCardProps) {
  return (
    <Card className={cn("border transition-colors", LEVEL_BG_SOFT[level])}>
      <CardContent className="p-4 space-y-3">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="opacity-70">{icon}</span>
            <span className="text-xs font-medium uppercase tracking-wide">{title}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onTest}
            disabled={testing}
            className="h-7 w-7 p-0"
            aria-label="Testar agora"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", testing && "animate-spin")} />
          </Button>
        </div>

        {/* status */}
        <div className="flex items-center gap-2">
          <span
            className={cn("inline-block w-2 h-2 rounded-full shrink-0", LEVEL_DOT[level], "animate-pulse-live")}
          />
          <span className={cn("text-sm font-semibold", LEVEL_TEXT[level])}>{statusLabel}</span>
        </div>

        {/* latency big */}
        <div className="flex items-baseline gap-1">
          <span className={cn("text-3xl font-bold tabular-nums tracking-tight", LEVEL_TEXT[level])}>
            {latency != null ? latency : "—"}
          </span>
          <span className="text-xs text-muted-foreground">ms</span>
        </div>

        {/* sparkline */}
        <Sparkline data={history} level={level} />

        {/* footer line */}
        <div className="text-[11px] text-muted-foreground tabular-nums">{footerLine}</div>

        {/* description */}
        <p className="text-xs text-foreground/80 leading-snug border-t border-border/50 pt-2">
          {description}
        </p>
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
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [, force] = useState(0);
  const conn = useConnectivity();
  const mounted = useRef(true);

  // tick para atualizar "há Xs"
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // device
  const [deviceType, setDeviceType] = useState<DeviceType>(() => getDeviceType());
  const [friendlyName, setFriendlyName] = useState<string>(() => getDeviceFriendlyName());
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(friendlyName);
  const role = useMemo(() => getCurrentRole(window.location.pathname), []);
  const showPrinter = roleUsesPrinter(role);
  const deviceLabel = getDeviceTypeLabel(deviceType);
  const DeviceIcon = deviceType === "desktop" ? Monitor : deviceType === "tablet" ? Tablet : Smartphone;

  useEffect(() => {
    const onResize = () => setDeviceType(getDeviceType());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
    const tasks: Promise<unknown>[] = [pingServer().then((sl) => ({ kind: "server" as const, sl }))];
    tasks.push(pingInternet().then((il) => ({ kind: "internet" as const, il })));
    if (showPrinter) {
      tasks.push(pingPrinter().then((p) => ({ kind: "printer" as const, ...p })));
    }
    const results = (await Promise.all(tasks)) as Array<
      | { kind: "server"; sl: number | null }
      | { kind: "internet"; il: number | null }
      | { kind: "printer"; latency: number | null; meta: PrinterMeta }
    >;
    if (!mounted.current) return;
    const ts = Date.now();
    for (const r of results) {
      if (r.kind === "server") push("server", { ts, latency: r.sl });
      else if (r.kind === "internet") push("internet", { ts, latency: r.il });
      else {
        push("printer", { ts, latency: r.latency });
        setPrinterMeta(r.meta);
      }
    }
    setLastCheck(ts);
  }, [push, showPrinter]);

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
      } else stop();
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mounted.current = false;
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [runAll]);

  // levels
  const internetLast = internetHistory[internetHistory.length - 1];
  const internetLatency = internetLast?.latency ?? null;
  const navOnline = navigator.onLine;
  const internetLevel: Level = !navOnline ? "bad" : classifyLatency(internetLatency);

  const serverLast = serverHistory[serverHistory.length - 1];
  const serverLatency = serverLast?.latency ?? null;
  const serverLatLevel = classifyLatency(serverLatency);
  const realtimeLevel: Level =
    conn.realtime === "online" ? "ok" : conn.realtime === "degraded" ? "warn" : "bad";
  const serverLevel: Level =
    serverLatLevel === "bad" || realtimeLevel === "bad"
      ? "bad"
      : serverLatLevel === "warn" || realtimeLevel === "warn"
      ? "warn"
      : "ok";

  const printerLast = printerHistory[printerHistory.length - 1];
  const printerLatency = printerLast?.latency ?? null;
  const printerLevel: Level = classifyLatency(printerLatency);

  const internetAvg = average(internetHistory);
  const serverAvg = average(serverHistory);
  const printerOfflineSince = offlineSince(printerHistory);

  // resumo geral
  const levels: Level[] = [internetLevel, serverLevel];
  if (showPrinter) levels.push(printerLevel);
  const worst: Level = levels.includes("bad") ? "bad" : levels.includes("warn") ? "warn" : "ok";

  const summary = (() => {
    if (worst === "ok")
      return {
        Icon: CheckCircle2,
        title: "Tudo funcionando neste dispositivo",
        sub: "Internet, servidor e impressora respondendo bem.",
      };
    if (worst === "bad") {
      if (internetLevel === "bad")
        return {
          Icon: XCircle,
          title: "Sem internet neste aparelho",
          sub: "Verifique o Wi-Fi ou os dados móveis.",
        };
      if (serverLevel === "bad")
        return {
          Icon: XCircle,
          title: "Sem conexão com o servidor",
          sub: "Pedidos podem não sincronizar até voltar.",
        };
      return {
        Icon: XCircle,
        title: "Impressora desligada",
        sub: "Pedidos estão na fila aguardando a impressora voltar.",
      };
    }
    if (internetLevel === "warn")
      return {
        Icon: AlertTriangle,
        title: `Internet do seu ${deviceLabel.toLowerCase()} está lenta`,
        sub: "Pedidos podem demorar pra chegar.",
      };
    if (serverLevel === "warn")
      return {
        Icon: AlertTriangle,
        title: "Servidor respondendo devagar",
        sub: "Sincronização pode atrasar alguns segundos.",
      };
    return {
      Icon: AlertTriangle,
      title: "Impressora respondendo devagar",
      sub: "Impressões podem levar mais tempo que o normal.",
    };
  })();

  const displayName = friendlyName || `${deviceLabel} (${role})`;

  const saveName = () => {
    setDeviceFriendlyName(draftName);
    setFriendlyName(draftName.trim());
    setEditingName(false);
  };

  const lastCheckLabel = lastCheck
    ? (() => {
        const s = Math.round((Date.now() - lastCheck) / 1000);
        if (s < 5) return "agora mesmo";
        if (s < 60) return `há ${s}s`;
        return `há ${Math.round(s / 60)}min`;
      })()
    : "—";

  // navigator.connection (dados reais)
  const navConn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number; type?: string } }).connection;
  const heartbeatAgo = conn.lastRealtimeHeartbeat
    ? Math.round((Date.now() - conn.lastRealtimeHeartbeat) / 1000)
    : null;

  const internetDescription =
    internetLevel === "ok"
      ? `Tudo normal nesse ${deviceLabel.toLowerCase()}.`
      : internetLevel === "warn"
      ? "Sua internet está oscilando — pedidos podem demorar."
      : `Esse ${deviceLabel.toLowerCase()} está sem internet. Verifique Wi-Fi ou dados móveis.`;

  const serverDescription =
    serverLevel === "ok"
      ? "Servidor e tempo real respondendo bem."
      : serverLevel === "warn"
      ? "Servidor lento, pode atrasar a sincronização."
      : "Sem resposta do servidor. Tentando reconectar.";

  const printerDescription =
    printerLevel === "ok"
      ? "Impressora pronta. Pedidos imprimem normalmente."
      : printerLevel === "warn"
      ? "Ponte respondendo devagar — impressões podem atrasar."
      : "Pedidos ficam na fila até a impressora voltar.";

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* HEADER do dispositivo */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="p-4 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <DeviceIcon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Este dispositivo
              </div>
              {editingName ? (
                <div className="flex items-center gap-2 mt-1.5">
                  <Input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder={`Ex: ${deviceLabel} do balcão`}
                    className="h-9 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") {
                        setDraftName(friendlyName);
                        setEditingName(false);
                      }
                    }}
                  />
                  <Button size="sm" variant="default" onClick={saveName} className="h-9 w-9 p-0">
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraftName(friendlyName);
                      setEditingName(false);
                    }}
                    className="h-9 w-9 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <h2 className="text-xl font-bold leading-tight truncate">{displayName}</h2>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {role}
                  </Badge>
                  <button
                    onClick={() => {
                      setDraftName(friendlyName);
                      setEditingName(true);
                    }}
                    className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors"
                    aria-label="Renomear dispositivo"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse-live" />
                Verificando a cada 5s · última: <span className="text-foreground/80">{lastCheckLabel}</span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={runAll}
              disabled={testing !== null}
              className="shrink-0 hidden sm:flex"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", testing && "animate-spin")} />
              Testar tudo
            </Button>
          </div>

          {/* Banner resumo */}
          <div
            className={cn(
              "px-4 py-3 border-t flex items-start gap-3",
              LEVEL_BG_SOFT[worst],
            )}
          >
            <summary.Icon className={cn("w-5 h-5 shrink-0 mt-0.5", LEVEL_TEXT[worst])} />
            <div className="flex-1 min-w-0">
              <div className={cn("text-sm font-semibold", LEVEL_TEXT[worst])}>{summary.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{summary.sub}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile: testar tudo */}
      <Button
        size="sm"
        variant="outline"
        onClick={runAll}
        disabled={testing !== null}
        className="w-full sm:hidden"
      >
        <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", testing && "animate-spin")} />
        Testar tudo agora
      </Button>

      {/* CARDS de métrica */}
      <div className={cn("grid grid-cols-1 gap-3", showPrinter ? "md:grid-cols-3" : "md:grid-cols-2")}>
        <MetricCard
          title="Sua internet"
          icon={<Wifi className="w-4 h-4" />}
          level={internetLevel}
          statusLabel={LEVEL_LABEL_INTERNET[internetLevel]}
          latency={internetLatency}
          history={internetHistory}
          description={internetDescription}
          footerLine={
            internetAvg != null
              ? `média ${internetAvg}ms · ${internetHistory.length} medições`
              : "sem dados"
          }
          onTest={runInternet}
          testing={testing === "internet"}
        />

        <MetricCard
          title="Servidor"
          icon={<Cloud className="w-4 h-4" />}
          level={serverLevel}
          statusLabel={LEVEL_LABEL_SERVER[serverLevel]}
          latency={serverLatency}
          history={serverHistory}
          description={serverDescription}
          footerLine={
            serverAvg != null
              ? `média ${serverAvg}ms · realtime ${conn.realtime}`
              : `realtime ${conn.realtime}`
          }
          onTest={runServer}
          testing={testing === "server"}
        />

        {showPrinter && (
          <MetricCard
            title="Impressora local"
            icon={<Printer className="w-4 h-4" />}
            level={printerLevel}
            statusLabel={LEVEL_LABEL_PRINTER[printerLevel]}
            latency={printerLatency}
            history={printerHistory}
            description={printerDescription}
            footerLine={
              printerLevel === "bad"
                ? `offline ${formatSince(printerOfflineSince)}`
                : printerMeta.printerCount != null
                ? `${printerMeta.printerCount} impressora${printerMeta.printerCount === 1 ? "" : "s"} detectada${printerMeta.printerCount === 1 ? "" : "s"}`
                : "ponte respondendo"
            }
            onTest={runPrinter}
            testing={testing === "printer"}
          />
        )}
      </div>

      {/* DETALHES TÉCNICOS */}
      <Card>
        <Accordion type="single" collapsible>
          <AccordionItem value="tech" className="border-b-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-2 text-sm">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">Detalhes técnicos</span>
                <Badge variant="outline" className="text-[10px] h-5 ml-1">
                  dados reais
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px]">
                <TechRow label="navigator.onLine" value={String(navOnline)} />
                <TechRow
                  label="connection.effectiveType"
                  value={navConn?.effectiveType ?? "n/a"}
                />
                <TechRow
                  label="connection.downlink"
                  value={navConn?.downlink != null ? `${navConn.downlink} Mbps` : "n/a"}
                />
                <TechRow
                  label="connection.rtt"
                  value={navConn?.rtt != null ? `${navConn.rtt} ms` : "n/a"}
                />
                <TechRow label="realtime.status" value={conn.realtime} />
                <TechRow
                  label="realtime.heartbeat"
                  value={heartbeatAgo != null ? `há ${heartbeatAgo}s` : "—"}
                />
                <TechRow label="backend.status" value={conn.backend} />
                <TechRow label="bridge.url" value="http://localhost:9100/health" />
                <TechRow
                  label="bridge.printers"
                  value={printerMeta.printerCount != null ? String(printerMeta.printerCount) : "—"}
                />
                <TechRow
                  label="internet.last"
                  value={internetLatency != null ? `${internetLatency} ms` : "fail"}
                />
                <TechRow
                  label="server.last"
                  value={serverLatency != null ? `${serverLatency} ms` : "fail"}
                />
                <TechRow
                  label="printer.last"
                  value={printerLatency != null ? `${printerLatency} ms` : "fail"}
                />
                <TechRow label="device.type" value={deviceType} />
                <TechRow label="device.role" value={role} />
                <TechRow label="poll.interval" value={`${POLL_INTERVAL_MS}ms`} />
                <TechRow label="history.size" value={String(HISTORY_SIZE)} />
              </dl>
              <div className="mt-3 pt-3 border-t text-[10px] text-muted-foreground font-mono break-all">
                UA: {navigator.userAgent}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </div>
  );
}

function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/40 py-1">
      <dt className="text-muted-foreground truncate">{label}</dt>
      <dd className="text-foreground tabular-nums truncate text-right">{value}</dd>
    </div>
  );
}
