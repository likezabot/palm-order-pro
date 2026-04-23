import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Activity, Printer, Cloud, Wifi, RefreshCw, Pencil, Check, X, Smartphone, Tablet, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

const HISTORY_SIZE = 20;
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

function colorClass(level: Level) {
  if (level === "ok") return "text-success";
  if (level === "warn") return "text-warning";
  return "text-destructive";
}

function bgClass(level: Level) {
  if (level === "ok") return "bg-success";
  if (level === "warn") return "bg-warning";
  return "bg-destructive";
}

function levelEmoji(level: Level) {
  return level === "ok" ? "🟢" : level === "warn" ? "🟡" : "🔴";
}

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

function Sparkline({ data, level }: { data: Measurement[]; level: Level }) {
  if (data.length < 2) {
    return <div className="h-6 flex items-center text-[10px] text-muted-foreground">Coletando…</div>;
  }
  const values = data.map((d) => d.latency ?? 1500);
  const max = Math.max(...values, 100);
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const v = d.latency ?? max;
      const y = 30 - (v / (max || 1)) * 28 - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const stroke =
    level === "ok" ? "hsl(var(--success))" : level === "warn" ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  return (
    <svg viewBox="0 0 100 30" className="w-full h-6 opacity-70" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface SimpleCardProps {
  title: string;
  icon: React.ReactNode;
  level: Level;
  headline: string;
  description: string;
  latency: number | null;
  history: Measurement[];
  onTest: () => void;
  testing: boolean;
}

function SimpleCard({ title, icon, level, headline, description, latency, history, onTest, testing }: SimpleCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground font-medium">
            {icon}
            {title}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={onTest} disabled={testing} className="h-7 px-2">
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-2xl leading-none">{levelEmoji(level)}</span>
          <div className="flex-1 min-w-0">
            <div className={`text-lg font-bold ${colorClass(level)}`}>{headline}</div>
            <p className="text-xs text-muted-foreground leading-snug">{description}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {latency != null ? `${latency}ms` : "sem resposta"}
          </span>
          <div className="flex-1">
            <Sparkline data={history} level={level} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function describeInternet(level: Level, deviceLabel: string): { headline: string; description: string } {
  if (level === "ok")
    return { headline: "Boa", description: `Tudo funcionando normal nesse ${deviceLabel.toLowerCase()}.` };
  if (level === "warn")
    return {
      headline: "Lenta",
      description: "Sua internet está oscilando. Pedidos podem demorar pra chegar.",
    };
  return {
    headline: "Sem conexão",
    description: `Esse ${deviceLabel.toLowerCase()} está sem internet. Verifique Wi-Fi ou dados móveis.`,
  };
}

function describeServer(level: Level): { headline: string; description: string } {
  if (level === "ok") return { headline: "Online", description: "Servidor respondendo bem." };
  if (level === "warn")
    return { headline: "Devagar", description: "Servidor demorando pra responder. Pedidos podem atrasar." };
  return { headline: "Sem resposta", description: "Não estamos conseguindo falar com o servidor agora." };
}

function describePrinter(level: Level, count: number | null): { headline: string; description: string } {
  if (level === "ok") {
    const c = count != null ? ` (${count} conectada${count === 1 ? "" : "s"})` : "";
    return { headline: `Funcionando${c}`, description: "Impressora pronta pra imprimir pedidos." };
  }
  if (level === "warn")
    return { headline: "Lenta", description: "Ponte respondendo devagar — impressões podem atrasar." };
  return {
    headline: "Desligada",
    description: "A impressora não está respondendo. Pedidos ficam na fila até voltar.",
  };
}

export default function NetworkTab() {
  const [printerHistory, setPrinterHistory] = useState<Measurement[]>([]);
  const [serverHistory, setServerHistory] = useState<Measurement[]>([]);
  const [internetHistory, setInternetHistory] = useState<Measurement[]>([]);
  const [printerMeta, setPrinterMeta] = useState<PrinterMeta>({ printerCount: null, printerOk: null });
  const [testing, setTesting] = useState<Source | null>(null);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const conn = useConnectivity();
  const mounted = useRef(true);

  // Device info
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

  // Levels
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

  // Resumo geral
  const levels: Level[] = [internetLevel, serverLevel];
  if (showPrinter) levels.push(printerLevel);
  const worst: Level = levels.includes("bad") ? "bad" : levels.includes("warn") ? "warn" : "ok";

  const summary = (() => {
    if (worst === "ok") return { emoji: "✅", text: "Tudo certo neste aparelho", cls: "text-success" };
    if (worst === "bad") {
      if (internetLevel === "bad") return { emoji: "❌", text: "Sem internet neste aparelho", cls: "text-destructive" };
      if (serverLevel === "bad")
        return { emoji: "❌", text: "Sem conexão com o servidor", cls: "text-destructive" };
      return { emoji: "❌", text: "Impressora desligada — pedidos ficam na fila", cls: "text-destructive" };
    }
    if (internetLevel === "warn")
      return { emoji: "⚠️", text: `Internet do seu ${deviceLabel.toLowerCase()} está lenta — pedidos podem atrasar`, cls: "text-warning" };
    if (serverLevel === "warn")
      return { emoji: "⚠️", text: "Servidor respondendo devagar — pedidos podem atrasar", cls: "text-warning" };
    return { emoji: "⚠️", text: "Impressora respondendo devagar", cls: "text-warning" };
  })();

  const internetDesc = describeInternet(internetLevel, deviceLabel);
  const serverDesc = describeServer(serverLevel);
  const printerDesc = describePrinter(printerLevel, printerMeta.printerCount);

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

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Cabeçalho do dispositivo */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <DeviceIcon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Este dispositivo</div>
              {editingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder={`Ex: ${deviceLabel} do balcão`}
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") {
                        setDraftName(friendlyName);
                        setEditingName(false);
                      }
                    }}
                  />
                  <Button size="sm" variant="default" onClick={saveName} className="h-8">
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraftName(friendlyName);
                      setEditingName(false);
                    }}
                    className="h-8"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-bold truncate">{displayName}</span>
                  <Badge variant="outline" className="text-xs">
                    {role}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraftName(friendlyName);
                      setEditingName(true);
                    }}
                    className="h-6 px-2"
                  >
                    <Pencil className="w-3 h-3 mr-1" />
                    <span className="text-xs">Renomear</span>
                  </Button>
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                Última verificação: <span className="text-foreground">{lastCheckLabel}</span>
              </div>
            </div>
          </div>

          {/* Resumo geral */}
          <div className={`mt-3 pt-3 border-t flex items-center gap-2 ${summary.cls}`}>
            <span className="text-xl">{summary.emoji}</span>
            <span className="font-semibold text-sm">{summary.text}</span>
          </div>
        </CardContent>
      </Card>

      {/* Cards */}
      <div className={`grid grid-cols-1 ${showPrinter ? "md:grid-cols-3" : "md:grid-cols-2"} gap-3`}>
        <SimpleCard
          title={`Sua internet (${deviceLabel.toLowerCase()})`}
          icon={<Wifi className="w-4 h-4" />}
          level={internetLevel}
          headline={internetDesc.headline}
          description={internetDesc.description}
          latency={internetLatency}
          history={internetHistory}
          onTest={runInternet}
          testing={testing === "internet"}
        />

        <SimpleCard
          title="Servidor"
          icon={<Cloud className="w-4 h-4" />}
          level={serverLevel}
          headline={serverDesc.headline}
          description={serverDesc.description}
          latency={serverLatency}
          history={serverHistory}
          onTest={runServer}
          testing={testing === "server"}
        />

        {showPrinter && (
          <SimpleCard
            title="Impressora local"
            icon={<Printer className="w-4 h-4" />}
            level={printerLevel}
            headline={printerDesc.headline}
            description={printerDesc.description}
            latency={printerLatency}
            history={printerHistory}
            onTest={runPrinter}
            testing={testing === "printer"}
          />
        )}
      </div>

      {/* Rodapé técnico discreto */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            Detalhes técnicos
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${bgClass(realtimeLevel)}`} />
            Realtime: <span className="font-mono">{conn.realtime}</span>
          </div>
          <div>
            navigator.onLine: <span className="font-mono">{String(navOnline)}</span>
          </div>
          <div>Atualiza a cada 5s. Pausa quando a aba não está visível.</div>
        </CardContent>
      </Card>
    </div>
  );
}
