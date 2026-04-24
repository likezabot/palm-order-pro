/**
 * Painel de diagnóstico da impressora — Plano B Espetaria
 *
 * Três botões isolados para diferenciar onde está o problema:
 *  - Health avançado: verifica /health com latência + versão da bridge
 *  - Teste mínimo: payload ESC/POS curtinho (ESC @ + 1 linha + corte)
 *  - Teste cupom completo: payload normal do site (cai no mesmo pipeline real)
 *
 * Mantém uma timeline local com até 20 eventos para diagnóstico ao vivo.
 */
import { useState } from "react";
import { Activity, Printer, Receipt, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { checkBridgeStatus, sendTestMinimal, type BridgeHealth } from "@/lib/thermal-printer";
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
  kind: "health" | "minimal" | "full";
  ok: boolean;
  latencyMs?: number;
  message: string;
  detail?: Record<string, unknown>;
};

const KIND_LABEL: Record<DiagEvent["kind"], string> = {
  health: "Health",
  minimal: "Teste mínimo",
  full: "Cupom completo",
};

interface Props {
  bridgeUrl: string;
}

export function PrinterDiagnostics({ bridgeUrl }: Props) {
  const { toast } = useToast();
  const [running, setRunning] = useState<DiagEvent["kind"] | null>(null);
  const [events, setEvents] = useState<DiagEvent[]>([]);

  const push = (e: Omit<DiagEvent, "id" | "at">) => {
    setEvents((prev) =>
      [
        { ...e, id: crypto.randomUUID(), at: new Date().toLocaleTimeString("pt-BR") },
        ...prev,
      ].slice(0, 20),
    );
  };

  const runHealth = async () => {
    setRunning("health");
    try {
      // força bypass de cache passando timestamp na URL
      const status: BridgeHealth = await checkBridgeStatus(bridgeUrl + "?t=" + Date.now());
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

  return (
    <section className="space-y-3 p-4 rounded-lg border border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold uppercase tracking-wider">
          Diagnóstico da impressora
        </h3>
      </div>
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
