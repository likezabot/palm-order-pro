/**
 * Diagnóstico de ORIGEM da impressão.
 *
 * Foco: provar de qual instância/máquina o papel está saindo.
 * Não mexe em layout, EXE, bridge, USB, print_jobs, fila — só investiga.
 *
 * Funcionalidades:
 *  1. Detecta ambiente atual (mobile/desktop, hostname, BRIDGE_URL).
 *  2. Avisa quando BRIDGE_URL=localhost em dispositivo móvel.
 *  3. Campo assistido para IP do PC (monta http://IP:9100/print).
 *  4. Testa /health, /printers e /config independentemente.
 *  5. "Teste de Origem": imprime APP_BUILD + PRINT_ENGINE + BRIDGE_URL.
 *  6. Checklist de instâncias antigas que podem estar imprimindo.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Smartphone,
  Monitor,
  Wifi,
  Printer,
  ScanSearch,
  Network,
  ListChecks,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  checkBridgeStatus,
  listBridgePrinters,
  sendOriginTest,
} from "@/lib/thermal-printer";
import { APP_BUILD, PRINT_ENGINE_VERSION } from "@/lib/print-engine";

// ============================================================
// helpers
// ============================================================

type DeviceKind = "mobile" | "tablet" | "desktop";

function detectDevice(): DeviceKind {
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook/i.test(ua) || (/(Android)/i.test(ua) && !/Mobile/i.test(ua))) {
    return "tablet";
  }
  if (/Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

function isLocalhostUrl(url: string): boolean {
  if (!url) return false;
  return /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url);
}

function buildBridgeUrlFromIp(ip: string): string {
  const clean = ip.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:.*/, "");
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) return "";
  return `http://${clean}:9100/print`;
}

function shortUa(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android Mobile" : "Android Tablet";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return ua.slice(0, 40);
}

// ============================================================
// Tipos de evento de teste
// ============================================================

type EndpointStatus = "idle" | "running" | "ok" | "fail";

interface EndpointResult {
  status: EndpointStatus;
  latencyMs?: number;
  message?: string;
  detail?: string;
}

interface Props {
  bridgeUrl: string;
  configSource: string;
  onBridgeUrlChange: (url: string) => void;
}

// ============================================================
// Componente
// ============================================================

export default function BridgeOriginDiagnostics({
  bridgeUrl,
  configSource,
  onBridgeUrlChange,
}: Props) {
  const device = useMemo(detectDevice, []);
  const hostname = typeof window !== "undefined" ? window.location.hostname : "?";
  const isLocalhost = isLocalhostUrl(bridgeUrl);
  const localhostOnMobile = isLocalhost && device !== "desktop";

  const [pcIp, setPcIp] = useState("");
  const [healthRes, setHealthRes] = useState<EndpointResult>({ status: "idle" });
  const [printersRes, setPrintersRes] = useState<EndpointResult>({ status: "idle" });
  const [configRes, setConfigRes] = useState<EndpointResult>({ status: "idle" });
  const [originRes, setOriginRes] = useState<EndpointResult>({ status: "idle" });

  // ---- Aplica IP do PC ----
  const applyPcIp = () => {
    const url = buildBridgeUrlFromIp(pcIp);
    if (!url) {
      toast.error("IP inválido. Use formato 192.168.x.x");
      return;
    }
    onBridgeUrlChange(url);
    toast.success(`Bridge configurada: ${url} (apenas neste dispositivo).`);
  };

  // ---- Testa todos os endpoints ----
  const runEndpointTests = async () => {
    setHealthRes({ status: "running" });
    setPrintersRes({ status: "running" });
    setConfigRes({ status: "running" });

    // /health
    try {
      const t0 = performance.now();
      const h = await checkBridgeStatus(bridgeUrl + "?t=" + Date.now());
      const ms = Math.round(performance.now() - t0);
      setHealthRes({
        status: h.online ? "ok" : "fail",
        latencyMs: h.latencyMs ?? ms,
        message: h.online
          ? `Online${h.bridge_version ? ` · v${h.bridge_version}` : ""}`
          : h.error ?? "Sem resposta",
        detail: h.printer_connected
          ? "Impressora detectada"
          : h.online
          ? "Impressora NÃO detectada"
          : undefined,
      });
    } catch (e: any) {
      setHealthRes({ status: "fail", message: e?.message ?? "erro" });
    }

    // /printers
    try {
      const r = await listBridgePrinters(bridgeUrl);
      setPrintersRes({
        status: r.ok ? "ok" : "fail",
        message: r.ok
          ? `${r.printers.length} impressora(s) listada(s)`
          : r.error ?? "endpoint /printers indisponível",
      });
    } catch (e: any) {
      setPrintersRes({ status: "fail", message: e?.message ?? "erro" });
    }

    // /config (GET — bridges v2.1+ respondem)
    try {
      const base = bridgeUrl.replace(/\/(?:print|health)\/?(\?.*)?$/, "");
      const ctrl = new AbortController();
      const id = setTimeout(() => ctrl.abort(), 4000);
      const t0 = performance.now();
      const res = await fetch(`${base}/config?t=${Date.now()}`, {
        signal: ctrl.signal,
        cache: "no-cache",
      });
      clearTimeout(id);
      const ms = Math.round(performance.now() - t0);
      if (!res.ok) {
        setConfigRes({
          status: "fail",
          latencyMs: ms,
          message: `HTTP ${res.status}`,
        });
      } else {
        const data = await res.json().catch(() => ({}));
        const printerName =
          data.printer_name ?? data.printer ?? data.config?.printer_name ?? "—";
        setConfigRes({
          status: "ok",
          latencyMs: ms,
          message: `Impressora atual: ${printerName}`,
        });
      }
    } catch (e: any) {
      setConfigRes({
        status: "fail",
        message: classifyNetworkError(e, bridgeUrl),
      });
    }
  };

  // ---- Imprime cupom de origem ----
  const runOriginPrint = async () => {
    setOriginRes({ status: "running" });
    try {
      const r = await sendOriginTest({
        bridgeUrl,
        appBuild: APP_BUILD,
        engineVersion: PRINT_ENGINE_VERSION,
        configSource,
        hostname,
      });
      setOriginRes({
        status: r.ok ? "ok" : "fail",
        latencyMs: r.latencyMs,
        message: r.ok
          ? "Cupom enviado. Confira se saiu papel com APP_BUILD/ENGINE atuais."
          : r.error ?? "Bridge não aceitou o payload",
      });
      if (r.ok) {
        toast.success("Teste de origem enviado.");
      } else {
        toast.error("Falha ao imprimir teste de origem.");
      }
    } catch (e: any) {
      setOriginRes({ status: "fail", message: e?.message ?? "erro" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <ScanSearch className="w-4 h-4 text-primary" />
          Diagnóstico de origem da impressão
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ===== 1. AMBIENTE ATUAL ===== */}
        <section className="space-y-2">
          <SectionTitle icon={Wifi}>Ambiente atual</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <Pill label="Dispositivo" value={shortUa()} icon={device === "desktop" ? Monitor : Smartphone} />
            <Pill label="Tipo" value={device.toUpperCase()} />
            <Pill label="Hostname" value={hostname} mono />
            <Pill label="BRIDGE_URL" value={bridgeUrl || "—"} mono className="col-span-2 sm:col-span-3" />
            <Pill
              label="É localhost?"
              value={isLocalhost ? "SIM" : "Não"}
              tone={isLocalhost ? "warning" : "neutral"}
            />
          </div>

          {localhostOnMobile && (
            <Alert tone="danger">
              <strong>BRIDGE_URL=localhost em dispositivo móvel.</strong>
              <br />
              No celular/tablet, <code>localhost</code> aponta para este aparelho — não para o PC da
              impressora. A ponte vai sempre aparecer offline.
              <br />
              Use <code>http://IP_DO_PC:9100/print</code> (ex.: <code>http://192.168.0.10:9100/print</code>).
            </Alert>
          )}
          {isLocalhost && device === "desktop" && (
            <Alert tone="info">
              <strong>localhost OK no PC da impressora.</strong> Em outros dispositivos,
              troque por <code>http://IP_DO_PC:9100/print</code>.
            </Alert>
          )}
        </section>

        {/* ===== 2. IP ASSISTIDO ===== */}
        <section className="space-y-2">
          <SectionTitle icon={Network}>IP do PC da impressora</SectionTitle>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={pcIp}
              onChange={(e) => setPcIp(e.target.value)}
              placeholder="192.168.0.10"
              inputMode="decimal"
              className="font-mono text-xs"
              aria-label="IP do PC da impressora"
            />
            <Button onClick={applyPcIp} className="font-bold gap-2 shrink-0" disabled={!pcIp.trim()}>
              <Wifi className="w-4 h-4" /> Usar IP do PC
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Salvo apenas neste dispositivo (não sincroniza). Para descobrir o IP do PC, abra o CMD
            no PC da impressora e digite <code className="font-mono">ipconfig</code>.
          </p>
        </section>

        {/* ===== 3. TESTE DE ENDPOINTS ===== */}
        <section className="space-y-2">
          <SectionTitle icon={ScanSearch}>Testes de conexão</SectionTitle>
          <Button
            onClick={runEndpointTests}
            variant="outline"
            className="w-full gap-2 font-bold"
            disabled={
              healthRes.status === "running" ||
              printersRes.status === "running" ||
              configRes.status === "running"
            }
          >
            <ScanSearch className="w-4 h-4" />
            Testar /health, /printers e /config
          </Button>
          <div className="space-y-1.5">
            <EndpointRow label="/health" result={healthRes} />
            <EndpointRow label="/printers" result={printersRes} />
            <EndpointRow label="/config" result={configRes} />
          </div>
        </section>

        {/* ===== 4. TESTE DE ORIGEM ===== */}
        <section className="space-y-2">
          <SectionTitle icon={Printer}>Teste de origem da impressão</SectionTitle>
          <Button
            onClick={runOriginPrint}
            className="w-full gap-2 font-bold"
            disabled={originRes.status === "running"}
          >
            <Printer className="w-4 h-4" />
            {originRes.status === "running" ? "Imprimindo..." : "Imprimir teste de origem"}
          </Button>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Envia direto pela bridge configurada acima, sem passar por pedido real. O cupom mostra{" "}
            <strong>APP_BUILD</strong>, <strong>PRINT_ENGINE</strong>, <strong>BRIDGE_URL</strong>{" "}
            e <strong>hora</strong> — se o papel não bater com os valores abaixo, OUTRA instância
            está imprimindo.
          </p>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            <Pill label="APP_BUILD" value={APP_BUILD.slice(0, 22)} mono />
            <Pill label="PRINT_ENGINE" value={PRINT_ENGINE_VERSION} mono />
          </div>
          {originRes.status !== "idle" && (
            <EndpointRow label="Resultado" result={originRes} />
          )}
        </section>

        {/* ===== 5. CHECKLIST DE INSTÂNCIAS ANTIGAS ===== */}
        <section className="space-y-2">
          <SectionTitle icon={ListChecks}>Possíveis instâncias antigas</SectionTitle>
          <p className="text-[11px] text-muted-foreground">
            Se o teste de origem imprime certo mas pedidos reais saem com layout antigo, alguma
            destas pode estar gerando o papel:
          </p>
          <ul className="space-y-1 text-[11px] pl-1">
            <Check>Outra aba/janela do app aberta no PC (verifique a barra de tarefas).</Check>
            <Check>EXE antigo (lp-bridge.exe ou app de impressão antigo) ainda rodando.</Check>
            <Check>PWA antigo instalado (Chrome → Apps → desinstalar versões antigas).</Check>
            <Check>PrintStation aberta em outro navegador/dispositivo.</Check>
            <Check>Outro app comercial ainda enviando direto pela porta da impressora.</Check>
            <Check>O papel sai sozinho ao chegar pedido (auto) ou só clicando aqui (manual)?</Check>
          </ul>
          <Alert tone="info">
            <strong>Como confirmar:</strong> feche TODAS as abas do app no PC, mantenha apenas
            uma. Se o papel parar de sair, era outra instância. Se continuar, é EXE/serviço.
          </Alert>
        </section>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Subcomponentes
// ============================================================

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof Wifi;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
      <Icon className="w-3.5 h-3.5" />
      {children}
    </div>
  );
}

function Pill({
  label,
  value,
  tone,
  mono,
  className,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger" | "neutral";
  mono?: boolean;
  className?: string;
  icon?: typeof Wifi;
}) {
  const cls =
    tone === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
      : tone === "danger"
      ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
      : tone === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
      : "border-border bg-muted/50 text-foreground";
  return (
    <div className={`rounded-md border px-2 py-1.5 ${cls} ${className ?? ""}`}>
      <div className="text-[9px] uppercase font-bold opacity-70 tracking-wide flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </div>
      <div className={`text-xs font-bold truncate ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function EndpointRow({ label, result }: { label: string; result: EndpointResult }) {
  const { status, latencyMs, message, detail } = result;
  const Icon =
    status === "ok" ? CheckCircle2 : status === "fail" ? XCircle : status === "running" ? ScanSearch : ScanSearch;
  const tone =
    status === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "fail"
      ? "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";
  return (
    <div className="flex items-start gap-2 text-[11px] p-2 rounded border border-border bg-muted/30">
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${tone} ${status === "running" ? "animate-pulse" : ""}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold">{label}</span>
          {typeof latencyMs === "number" && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono">
              {latencyMs}ms
            </Badge>
          )}
        </div>
        {message && <div className={`mt-0.5 ${tone}`}>{message}</div>}
        {detail && <div className="mt-0.5 text-muted-foreground italic">{detail}</div>}
      </div>
    </div>
  );
}

function Alert({
  tone,
  children,
}: {
  tone: "info" | "warning" | "danger";
  children: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
      : tone === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
      : "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200";
  const Icon = tone === "danger" || tone === "warning" ? AlertTriangle : CheckCircle2;
  return (
    <div className={`rounded-md border p-2.5 text-[11px] leading-snug ${cls}`}>
      <Icon className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
      {children}
    </div>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-primary font-bold mt-0.5">•</span>
      <span>{children}</span>
    </li>
  );
}

// ============================================================
// Classificação de erros de rede
// ============================================================

function classifyNetworkError(e: any, url: string): string {
  const msg = String(e?.message ?? e ?? "");
  if (e?.name === "AbortError") return "Timeout (sem resposta em 4s)";
  if (/Failed to fetch|NetworkError/i.test(msg)) {
    if (isLocalhostUrl(url)) {
      return "Conexão recusada (localhost). Em celular, troque por IP do PC.";
    }
    return "Conexão recusada (firewall? bridge fechada? porta 9100 bloqueada?)";
  }
  if (/CORS/i.test(msg)) return "Bloqueio CORS — bridge precisa habilitar CORS para este domínio.";
  if (/DNS/i.test(msg)) return "DNS/URL inválida.";
  return msg || "Erro desconhecido";
}
