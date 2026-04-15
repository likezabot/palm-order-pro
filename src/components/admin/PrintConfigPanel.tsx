import { useState, useEffect, useMemo } from "react";
import { loadPrintConfig, savePrintConfig, resetPrintConfig, syncPrintConfigFromDb, getFontSizes, type PrintConfig } from "@/lib/print-config";
import { buildReceiptHtml, buildSenhaHtml, printReceipt, printSenha } from "@/lib/print-receipt";
import { checkBridgeStatus } from "@/lib/thermal-printer";
import { Button } from "@/components/ui/button";
import { Printer, RotateCcw, AlertTriangle, CheckCircle2, Download, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

type PreviewMode = "receipt" | "senha";

const SAMPLE_ITEMS = [
  { product_name: "Espeto Picanha", quantity: 2, product_price: 15.0, note: "Bem passado" },
  { product_name: "Refrigerante Lata", quantity: 1, product_price: 8.5, note: null },
  { product_name: "Cerveja Original", quantity: 3, product_price: 12.0, note: "Bem gelada" },
  { product_name: "Espeto Frango", quantity: 2, product_price: 10.0, note: null },
];
const SAMPLE_TOTAL = 94.5;

export default function PrintConfigPanel() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<PrintConfig>(loadPrintConfig);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("receipt");
  const [bridgeStatus, setBridgeStatus] = useState<{ online: boolean; printer_connected: boolean; error?: string } | null>(null);
  const [checking, setChecking] = useState(false);

  // Sync from DB on mount
  useEffect(() => {
    syncPrintConfigFromDb().then(setCfg);
  }, []);

  // Check bridge health
  const verifyBridge = async (url: string) => {
    setChecking(true);
    const status = await checkBridgeStatus(url);
    setBridgeStatus(status);
    setChecking(false);
  };

  useEffect(() => {
    if (cfg.printMode === "bridge") {
      verifyBridge(cfg.bridgeUrl);
      const interval = setInterval(() => verifyBridge(cfg.bridgeUrl), 10000);
      return () => clearInterval(interval);
    } else {
      setBridgeStatus(null);
    }
  }, [cfg.printMode, cfg.bridgeUrl]);

  const update = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) => {
    setCfg((prev) => {
      const next = { ...prev, [key]: value };
      savePrintConfig(next);
      return next;
    });
  };

  const handleReset = () => {
    const fresh = resetPrintConfig();
    setCfg(fresh);
    toast({ title: "Configurações restauradas ao padrão" });
  };

  const handleTestPrint = async () => {
    let success = false;
    let errorMsg = "";

    try {
      if (previewMode === "senha") {
        success = await printSenha("042", SAMPLE_ITEMS);
      } else {
        success = await printReceipt("Mesa 5", "Carlos", SAMPLE_ITEMS, SAMPLE_TOTAL);
      }
    } catch (e: any) {
      success = false;
      errorMsg = e.message;
    }

    if (success) {
      toast({ 
        title: "Impressão enviada!", 
        description: "O comando foi processado com sucesso pela ponte.",
        className: "bg-emerald-50 border-emerald-200"
      });
    } else {
      toast({ 
        title: "Erro na Impressão", 
        description: cfg.printMode === "bridge" 
          ? (errorMsg || "Ponte local indisponível ou impressora desconectada.")
          : "Falha ao abrir janela de impressão do navegador.",
        variant: "destructive"
      });
    }
  };

  const previewHtml = useMemo(() => {
    if (previewMode === "senha") {
      return buildSenhaHtml("042", SAMPLE_ITEMS, cfg);
    }
    return buildReceiptHtml("Mesa 5", "Carlos", SAMPLE_ITEMS, SAMPLE_TOTAL, cfg);
  }, [cfg, previewMode]);

  const pxWidth = cfg.paperWidth === "58mm" ? 219 : 302;

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full">
      {/* Left: Simple controls */}
      <div className="flex-1 space-y-5 min-w-0 max-w-sm">
        
        {/* Paper Width */}
        <div className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Largura do Papel</p>
          <div className="flex gap-2">
            {(["58mm", "80mm"] as const).map((w) => (
              <Button
                key={w}
                variant={cfg.paperWidth === w ? "default" : "outline"}
                className="flex-1 font-bold"
                onClick={() => update("paperWidth", w)}
              >
                {w}
              </Button>
            ))}
          </div>
        </div>

        {/* Print Size */}
        <div className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tamanho da Impressão</p>
          <div className="flex gap-2">
            {([
              { key: "normal" as const, label: "Normal" },
              { key: "grande" as const, label: "Grande" },
            ]).map((opt) => (
              <Button
                key={opt.key}
                variant={cfg.printSize === opt.key ? "default" : "outline"}
                className="flex-1 font-bold"
                onClick={() => update("printSize", opt.key)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Print Mode */}
        <div className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Modo de Impressão</p>
          <div className="flex gap-2">
            {(["browser", "bridge"] as const).map((m) => (
              <Button
                key={m}
                variant={cfg.printMode === m ? "default" : "outline"}
                className="flex-1 font-bold"
                onClick={() => update("printMode", m)}
              >
                {m === "browser" ? "Navegador" : "Ponte Local"}
              </Button>
            ))}
          </div>
          
          {cfg.printMode === "bridge" ? (
            <div className="pt-2 p-3 bg-slate-900/5 rounded-lg border border-slate-200 space-y-3">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase">URL da Ponte Local</label>
                <div className="flex gap-2 mt-0.5">
                  <input 
                    type="text" 
                    value={cfg.bridgeUrl}
                    onChange={(e) => update("bridgeUrl", e.target.value)}
                    className="flex-1 p-2 text-xs border rounded bg-white font-mono focus:ring-1 focus:ring-primary outline-none"
                  />
                  <Button size="icon" variant="ghost" onClick={() => verifyBridge(cfg.bridgeUrl)} disabled={checking} className="h-8 w-8">
                    <RotateCcw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                <span className="text-muted-foreground uppercase">Status:</span>
                {bridgeStatus?.online ? (
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>PONTE ONLINE</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-rose-500">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>PONTE OFFLINE</span>
                  </div>
                )}
              </div>

              {bridgeStatus?.online && (
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold pt-1 border-t border-slate-200/50">
                  <span className="text-muted-foreground uppercase">Impressora USB:</span>
                  {bridgeStatus.printer_connected ? (
                    <span className="text-emerald-600">DETECTADA</span>
                  ) : (
                    <span className="text-amber-600">NÃO DETECTADA</span>
                  )}
                </div>
              )}

              {bridgeStatus?.error && (
                <p className="text-[10px] text-rose-500 font-medium leading-tight">
                  {bridgeStatus.error}
                </p>
              )}

              <div className="pt-1">
                <Button variant="link" className="h-auto p-0 text-[10px] gap-1 text-primary font-bold" asChild>
                  <a href="/BRIDGE_INSTRUCTIONS.md" target="_blank">
                    <Download className="w-3 h-3" /> VER INSTRUÇÕES DE INSTALAÇÃO
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-[10px] text-amber-700 leading-relaxed">
                <Info className="w-3 h-3 inline mr-1 mb-0.5" />
                No modo <strong>Navegador</strong>, o sistema abre a janela de impressão padrão do Windows. 
                Recomendado apenas para uso eventual.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1 gap-2 font-bold" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" /> RESETAR
          </Button>
          <Button className="flex-1 gap-2 font-bold" onClick={handleTestPrint}>
            <Printer className="w-4 h-4" /> TESTAR
          </Button>
        </div>
      </div>

      {/* Right: Preview */}
      <div className="flex-1 flex flex-col items-center min-w-0">
        <div className="flex gap-2 mb-3">
          <Button 
            size="sm" 
            variant={previewMode === "receipt" ? "default" : "outline"}
            onClick={() => setPreviewMode("receipt")}
            className="h-8 text-xs font-bold"
          >
            Cupom Pedido
          </Button>
          <Button 
            size="sm" 
            variant={previewMode === "senha" ? "default" : "outline"}
            onClick={() => setPreviewMode("senha")}
            className="h-8 text-xs font-bold"
          >
            Senha Balcão
          </Button>
        </div>

        <div
          className="bg-white rounded-lg shadow-xl overflow-hidden mx-auto border-4 border-slate-100"
          style={{ width: pxWidth, maxHeight: 600 }}
        >
          <iframe
            title="Print Preview"
            srcDoc={previewHtml}
            style={{
              width: pxWidth,
              minHeight: 400,
              maxHeight: 600,
              border: "none",
              display: "block",
            }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 uppercase font-bold tracking-widest">
          Simulação de Impressão ({cfg.paperWidth})
        </p>
      </div>
    </div>
  );
}

