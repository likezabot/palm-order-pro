/**
 * Painel de diagnóstico da impressora — Plano B Espetaria
 *
 * Três botões isolados para diferenciar onde está o problema:
 *  - Health avançado: verifica /health com latência + versão da bridge
 *  - Teste mínimo: payload ESC/POS curtinho (ESC @ + 1 linha + corte)
 *  - Teste cupom completo: payload normal do site (cai no mesmo pipeline real)
 *
 * Inclui também (bridge v2.1+): seletor da impressora do Windows e
 * indicador do modo de impressão ativo (nativo vs PowerShell).
 */
import { useEffect, useState } from "react";
import {
  Activity,
  Printer,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Save,
  Zap,
  Snail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  checkBridgeStatus,
  sendTestMinimal,
  listBridgePrinters,
  setBridgePrinter,
  type BridgeHealth,
  type BridgePrinterInfo,
} from "@/lib/thermal-printer";
import { printReceipt } from "@/lib/print-receipt";

const SAMPLE_ITEMS = [
  { product_name: "Espeto Picanha", quantity: 2, product_price: 15.0, note: "Bem passado" },
  { product_name: "Refrigerante Lata", quantity: 1, product_price: 8.5, note: null },
  { product_name: "Cerveja Original", quantity: 3, product_price: 12.0, note: "Bem gelada" },
];
const SAMPLE_TOTAL = 74.5;

type DiagEvent = {
  id: string;
  at: string;
  kind: "health" | "minimal" | "full" | "config";
  ok: boolean;
  latencyMs?: number;
  message: string;
  detail?: Record<string, unknown>;
};

const KIND_LABEL: Record<DiagEvent["kind"], string> = {
  health: "Health",
  minimal: "Teste mínimo",
  full: "Cupom completo",
  config: "Config",
};

interface Props {
  bridgeUrl: string;
}

export function PrinterDiagnostics({ bridgeUrl }: Props) {
  const { toast } = useToast();
  const [running, setRunning] = useState<DiagEvent["kind"] | null>(null);
  const [events, setEvents] = useState<DiagEvent[]>([]);

  // bridge v2.1: lista de impressoras + estado do health
  const [printers, setPrinters] = useState<BridgePrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [savingPrinter, setSavingPrinter] = useState(false);
  const [lastHealth, setLastHealth] = useState<BridgeHealth | null>(null);

  const push = (e: Omit<DiagEvent, "id" | "at">) => {
    setEvents((prev) =>
      [
        { ...e, id: crypto.randomUUID(), at: new Date().toLocaleTimeString("pt-BR") },
        ...prev,
      ].slice(0, 20),
    );
  };

  // Atualiza o health silenciosamente ao montar / quando bridgeUrl muda
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await checkBridgeStatus(bridgeUrl);
      if (!cancelled) setLastHealth(status);
    })();
    return () => {
      cancelled = true;
    };
  }, [bridgeUrl]);

  const runHealth = async () => {
    setRunning("health");
    try {
      // força bypass de cache passando timestamp na URL
      const status: BridgeHealth = await checkBridgeStatus(bridgeUrl + "?t=" + Date.now());
      setLastHealth(status);
      push({
        kind: "health",
        ok: status.online && status.printer_connected,
        latencyMs: status.latencyMs,
        message: status.online
          ? status.printer_connected
            ? `Online · impressora detectada${status.bridge_version ? ` · v${status.bridge_version}` : ""}`
            : `Online · IMPRESSORA NÃO DETECTADA${status.printer_status ? ` (${status.printer_status})` : ""}`
          : status.error ?? "Bridge offline",
        detail: status.raw,
      });
    } finally {
      setRunning(null);
    }
  };

  const runMinimal = async () => {
    setRunning("minimal");
    try {
      const r = await sendTestMinimal(bridgeUrl);
      push({
        kind: "minimal",
        ok: r.ok,
        latencyMs: r.latencyMs,
        message: r.ok
          ? "Payload mínimo aceito pela bridge — verifique se saiu papel"
          : r.error ?? "Bridge recusou o payload mínimo",
      });
      toast({
        title: r.ok ? "Teste mínimo enviado" : "Falha no teste mínimo",
        description: r.ok
          ? "Se NÃO saiu papel, problema é hardware (USB, papel, tampa)."
          : r.error ?? "Bridge não respondeu. Confirme se o .exe está rodando.",
        variant: r.ok ? "default" : "destructive",
      });
    } finally {
      setRunning(null);
    }
  };

  const runFull = async () => {
    setRunning("full");
    const t0 = performance.now();
    try {
      const ok = await printReceipt("Mesa 5", "Diagnóstico", SAMPLE_ITEMS, SAMPLE_TOTAL);
      const latencyMs = Math.round(performance.now() - t0);
      push({
        kind: "full",
        ok,
        latencyMs,
        message: ok
          ? "Cupom completo enviado pela pipeline real do site"
          : "Pipeline do site falhou (bridge offline ou impressora travada)",
      });
      toast({
        title: ok ? "Cupom enviado" : "Falha no cupom",
        description: ok
          ? "Saiu papel? Se sim, pipeline do site está OK."
          : "Verifique status da bridge acima e o teste mínimo.",
        variant: ok ? "default" : "destructive",
      });
    } finally {
      setRunning(null);
    }
  };

  const fetchPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const r = await listBridgePrinters(bridgeUrl);
      if (r.ok) {
        setPrinters(r.printers);
        // pré-seleciona a impressora atual da bridge se ainda não houver escolha
        const current = lastHealth?.raw?.printer_name as string | undefined;
        if (current && !selectedPrinter) setSelectedPrinter(current);
        push({
          kind: "config",
          ok: true,
          message: `Bridge listou ${r.printers.length} impressora(s)`,
        });
      } else {
        push({
          kind: "config",
          ok: false,
          message: r.error ?? "Bridge não suporta /printers (versão antiga?)",
        });
        toast({
          title: "Não foi possível listar",
          description: r.error ?? "Bridge precisa ser v2.1 ou superior.",
          variant: "destructive",
        });
      }
    } finally {
      setLoadingPrinters(false);
    }
  };

  const savePrinter = async () => {
    if (!selectedPrinter) return;
    setSavingPrinter(true);
    try {
      const r = await setBridgePrinter(bridgeUrl, selectedPrinter);
      push({
        kind: "config",
        ok: r.ok,
        message: r.ok
          ? `Impressora salva na bridge: ${selectedPrinter}`
          : r.error ?? "Falha ao salvar impressora",
      });
      toast({
        title: r.ok ? "Impressora salva" : "Falha ao salvar",
        description: r.ok
          ? "A bridge agora vai mandar os cupons para esta impressora."
          : r.error ?? "Bridge recusou a configuração.",
        variant: r.ok ? "default" : "destructive",
      });
      if (r.ok) {
        // recarrega health pra refletir nova impressora
        const status = await checkBridgeStatus(bridgeUrl + "?t=" + Date.now());
        setLastHealth(status);
      }
    } finally {
      setSavingPrinter(false);
    }
  };

  const method = lastHealth?.raw?.printer_method as string | undefined;
  const currentPrinter = lastHealth?.raw?.printer_name as string | undefined;

  return (
    <section className="space-y-3 p-4 rounded-lg border border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold uppercase tracking-wider">
          Diagnóstico da impressora
        </h3>
      </div>

      {/* Modo da bridge (v2.1+) */}
      {method && (
        <div className="flex items-center justify-between gap-2 p-2 rounded border border-primary/20 bg-background/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Modo da bridge
          </span>
          {method === "spooler-native" ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
              <Zap className="w-3 h-3" /> Nativo (rápido)
            </span>
          ) : method === "spooler-powershell" ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-700 border border-amber-500/30">
              <Snail className="w-3 h-3" /> PowerShell (estável)
            </span>
          ) : (
            <span className="text-[10px] font-mono text-muted-foreground">{method}</span>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Use os 3 testes em ordem para isolar o problema:
        <br />
        <strong>1. Health</strong> — bridge respondendo? ·{" "}
        <strong>2. Mínimo</strong> — USB/impressora OK? ·{" "}
        <strong>3. Cupom</strong> — pipeline completa OK?
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button
          variant="outline"
          className="h-12 gap-2 font-bold"
          onClick={runHealth}
          disabled={running !== null}
        >
          <Activity className={`w-4 h-4 ${running === "health" ? "animate-pulse" : ""}`} />
          1. HEALTH
        </Button>
        <Button
          variant="outline"
          className="h-12 gap-2 font-bold"
          onClick={runMinimal}
          disabled={running !== null}
        >
          <Printer className={`w-4 h-4 ${running === "minimal" ? "animate-pulse" : ""}`} />
          2. MÍNIMO
        </Button>
        <Button
          variant="outline"
          className="h-12 gap-2 font-bold"
          onClick={runFull}
          disabled={running !== null}
        >
          <Receipt className={`w-4 h-4 ${running === "full" ? "animate-pulse" : ""}`} />
          3. CUPOM
        </Button>
      </div>

      {/* Seletor de impressora (bridge v2.1+) */}
      <div className="space-y-2 pt-3 border-t border-primary/20">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Impressora do Windows
          </span>
          {currentPrinter && (
            <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[60%]">
              atual: {currentPrinter}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={fetchPrinters}
            disabled={loadingPrinters}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPrinters ? "animate-spin" : ""}`} />
            Listar
          </Button>
          <Select
            value={selectedPrinter}
            onValueChange={setSelectedPrinter}
            disabled={printers.length === 0}
          >
            <SelectTrigger className="flex-1 h-9 text-xs">
              <SelectValue
                placeholder={
                  printers.length === 0
                    ? "Clique em Listar primeiro"
                    : "Escolha a impressora"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {printers.map((p) => (
                <SelectItem key={p.name} value={p.name} className="text-xs">
                  {p.name}
                  {p.is_default ? " (padrão)" : ""}
                  {p.status ? ` · ${p.status}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="gap-2"
            onClick={savePrinter}
            disabled={!selectedPrinter || savingPrinter || selectedPrinter === currentPrinter}
          >
            <Save className={`w-3.5 h-3.5 ${savingPrinter ? "animate-pulse" : ""}`} />
            Salvar
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Requer bridge <strong>v2.1+</strong>. Define qual fila do Windows recebe os cupons —
          a mesma usada pelo app de entregas pode ser compartilhada sem conflito.
        </p>
      </div>

      {events.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pt-2 border-t border-primary/20">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Timeline ({events.length})
          </p>
          {events.map((e) => (
            <div
              key={e.id}
              className={`text-xs p-2 rounded border flex items-start gap-2 ${
                e.ok
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-rose-200 bg-rose-50/50"
              }`}
            >
              {e.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold uppercase text-[10px] tracking-wider">
                    {KIND_LABEL[e.kind]}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {e.at}
                    {e.latencyMs !== undefined ? ` · ${e.latencyMs}ms` : ""}
                  </span>
                </div>
                <p className="text-[11px] leading-tight mt-0.5">{e.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default PrinterDiagnostics;
