import { useState, useEffect, useMemo } from "react";
import { loadPrintConfig, savePrintConfig, resetPrintConfig, syncPrintConfigFromDb, getFontSizes, type PrintConfig } from "@/lib/print-config";
import { buildReceiptHtml, buildSenhaHtml, printReceipt, printSenha } from "@/lib/print-receipt";
import { Button } from "@/components/ui/button";
import { Printer, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  // Sync from DB on mount
  useEffect(() => {
    syncPrintConfigFromDb().then(setCfg);
  }, []);

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

  const handleTestPrint = () => {
    if (previewMode === "senha") {
      printSenha("042", SAMPLE_ITEMS);
    } else {
      printReceipt("Mesa 5", "Carlos", SAMPLE_ITEMS, SAMPLE_TOTAL);
    }
    toast({ title: "Teste enviado para impressão!" });
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
          <p className="text-xs text-muted-foreground">
            {cfg.printSize === "grande"
              ? "Fonte maior — melhor legibilidade"
              : "Fonte padrão — mais compacto"}
          </p>
        </div>

        {/* Preview mode */}
        <div className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tipo de Preview</p>
          <div className="flex gap-2">
            <Button
              variant={previewMode === "receipt" ? "default" : "outline"}
              className="flex-1 font-bold text-sm"
              onClick={() => setPreviewMode("receipt")}
            >
              Cupom de Mesa
            </Button>
            <Button
              variant={previewMode === "senha" ? "default" : "outline"}
              className="flex-1 font-bold text-sm"
              onClick={() => setPreviewMode("senha")}
            >
              Senha / Balcão
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1 gap-2 font-bold" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" /> RESETAR
          </Button>
          <Button className="flex-1 gap-2 font-bold" onClick={handleTestPrint}>
            <Printer className="w-4 h-4" /> IMPRIMIR TESTE
          </Button>
        </div>
      </div>

      {/* Right: Preview */}
      <div className="flex-1 flex flex-col items-center min-w-0">
        <div className="text-xs text-muted-foreground mb-2 text-center">
          Preview {cfg.paperWidth} • {cfg.printSize === "grande" ? "Grande" : "Normal"}
        </div>
        <div
          className="bg-white rounded-lg shadow-lg overflow-hidden mx-auto"
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
      </div>
    </div>
  );
}
