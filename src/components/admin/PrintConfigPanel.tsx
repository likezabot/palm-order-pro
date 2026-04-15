import { useState, useEffect, useMemo } from "react";
import { loadPrintConfig, savePrintConfig, resetPrintConfig, type PrintConfig } from "@/lib/print-config";
import { buildReceiptHtml, buildSenhaHtml, printTest, printReceipt } from "@/lib/print-receipt";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
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

  // Auto-save on every change
  useEffect(() => {
    savePrintConfig(cfg);
  }, [cfg]);

  const update = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) => {
    setCfg((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    const fresh = resetPrintConfig();
    setCfg(fresh);
    toast({ title: "Configurações restauradas ao padrão" });
  };

  const handleTestPrint = () => {
    if (previewMode === "senha") {
      // Import printSenha inline
      const { printSenha } = require("@/lib/print-receipt");
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
      {/* Left: Controls */}
      <div className="flex-1 space-y-5 min-w-0">
        {/* Paper Width */}
        <div className="space-y-2">
          <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Largura do Papel</Label>
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

        {/* Font Sizes */}
        <div className="space-y-3">
          <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tamanhos de Fonte</Label>
          
          <SliderField label="Título" value={cfg.titleFontSize} min={12} max={28} onChange={(v) => update("titleFontSize", v)} />
          <SliderField label="Texto base" value={cfg.baseFontSize} min={10} max={20} onChange={(v) => update("baseFontSize", v)} />
          <SliderField label="Total" value={cfg.totalFontSize} min={12} max={24} onChange={(v) => update("totalFontSize", v)} />
          <SliderField label="Senha" value={cfg.senhaFontSize} min={32} max={96} onChange={(v) => update("senhaFontSize", v)} />
          <SliderField label="Observações" value={cfg.noteFontSize} min={8} max={16} onChange={(v) => update("noteFontSize", v)} />
          <SliderField label="Rodapé" value={cfg.footerFontSize} min={7} max={14} onChange={(v) => update("footerFontSize", v)} />
        </div>

        {/* Spacing */}
        <div className="space-y-3">
          <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Espaçamento</Label>
          <SliderField label="Entrelinhas" value={cfg.lineSpacing} min={1.0} max={2.0} step={0.1} onChange={(v) => update("lineSpacing", v)} />
          <SliderField label="Margem (mm)" value={cfg.receiptPadding} min={1} max={8} onChange={(v) => update("receiptPadding", v)} />
        </div>

        {/* Visibility toggles */}
        <div className="space-y-3">
          <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Exibir / Ocultar</Label>
          <div className="grid grid-cols-2 gap-2">
            <ToggleField label="Estabelecimento" checked={cfg.showEstablishment} onChange={(v) => update("showEstablishment", v)} />
            <ToggleField label="Garçom" checked={cfg.showWaiter} onChange={(v) => update("showWaiter", v)} />
            <ToggleField label="Mesa" checked={cfg.showTable} onChange={(v) => update("showTable", v)} />
            <ToggleField label="Data/Hora" checked={cfg.showDateTime} onChange={(v) => update("showDateTime", v)} />
            <ToggleField label="Observações" checked={cfg.showNotes} onChange={(v) => update("showNotes", v)} />
            <ToggleField label="Rodapé" checked={cfg.showFooter} onChange={(v) => update("showFooter", v)} />
            <ToggleField label="Linha de corte" checked={cfg.showCutLine} onChange={(v) => update("showCutLine", v)} />
          </div>
        </div>

        {/* Texts */}
        <div className="space-y-3">
          <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Textos</Label>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Cabeçalho</Label>
              <Input value={cfg.headerText} onChange={(e) => update("headerText", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Rodapé</Label>
              <Input value={cfg.footerText} onChange={(e) => update("footerText", e.target.value)} />
            </div>
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
        <div className="flex gap-2 mb-4 w-full max-w-xs">
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

        <div className="text-xs text-muted-foreground mb-2 text-center">
          Preview {cfg.paperWidth} — escala aproximada
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

// ============================================================
// Sub-components
// ============================================================

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm min-w-[90px] text-muted-foreground">{label}</span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="flex-1"
      />
      <span className="text-sm font-mono font-bold min-w-[36px] text-right">{value}</span>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 border border-border">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
