import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wifi, WifiOff, Loader2, Printer, RefreshCw } from "lucide-react";
import { checkBridgeStatus, type BridgeHealth } from "@/lib/thermal-printer";
import { printTest } from "@/lib/print-receipt";
import { toast } from "sonner";
import type { PrintConfig } from "@/lib/print-config";

interface Props {
  cfg: PrintConfig;
  onChangeBridgeUrl: (url: string) => void;
}

type Status = "idle" | "checking" | "online" | "offline" | "browser";

export default function BridgeStatusCard({ cfg, onChangeBridgeUrl }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [urlDraft, setUrlDraft] = useState(cfg.bridgeUrl);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setUrlDraft(cfg.bridgeUrl);
  }, [cfg.bridgeUrl]);

  const verify = useCallback(async () => {
    if (cfg.printMode !== "bridge") {
      setStatus("browser");
      setHealth(null);
      return;
    }
    setStatus("checking");
    try {
      const h = await checkBridgeStatus(cfg.bridgeUrl, true);
      setHealth(h);
      setStatus(h.online ? "online" : "offline");
    } catch {
      setStatus("offline");
    }
  }, [cfg.bridgeUrl, cfg.printMode]);

  useEffect(() => {
    verify();
    if (cfg.printMode !== "bridge") return;
    const id = setInterval(verify, 10_000);
    return () => clearInterval(id);
  }, [verify, cfg.printMode]);

  const dot =
    status === "online" ? "bg-emerald-500"
    : status === "offline" ? "bg-rose-500"
    : status === "checking" ? "bg-amber-500 animate-pulse"
    : "bg-zinc-400";

  const printerLabel = health?.printer_name && health.printer_name.toLowerCase() !== "unknown"
    ? health.printer_name
    : null;

  const headline =
    status === "online"
      ? `Bridge conectada${printerLabel ? ` — ${printerLabel}` : " — pronta"}`
      : status === "offline"
      ? "Bridge offline — verifique o app desktop"
      : status === "checking"
      ? "Verificando conexão…"
      : "Modo navegador (sem bridge)";

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      const ok = await printTest();
      if (ok) toast.success("Página de teste enviada à impressora");
      else toast.error("Falha ao enviar teste — verifique a bridge");
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? "?"}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border-l-4" style={{ borderLeftColor: status === "online" ? "hsl(var(--primary))" : undefined }}>
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${dot}`} />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base flex items-center gap-2">
              {status === "online" ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
              {headline}
            </div>
            {health && (
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {health.bridge_version && <span>v{health.bridge_version}</span>}
                {health.latencyMs != null && <span>{health.latencyMs}ms</span>}
                {health.printer_count != null && <span>{health.printer_count} impressora(s)</span>}
                {health.queue_depth != null && <span>fila: {health.queue_depth}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">URL da bridge</Label>
            <Input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={() => urlDraft !== cfg.bridgeUrl && onChangeBridgeUrl(urlDraft)}
              placeholder="http://localhost:9100"
              className="font-mono text-sm"
            />
          </div>
          <Button variant="outline" size="default" onClick={verify} disabled={status === "checking"}>
            {status === "checking" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Testar</span>
          </Button>
          <Button variant="default" size="default" onClick={handleTestPrint} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Imprimir teste</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
