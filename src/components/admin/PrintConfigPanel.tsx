import { useState, useEffect, useMemo } from "react";
import {
  loadPrintConfig,
  savePrintConfig,
  resetPrintConfig,
  syncPrintConfigFromDb,
  applyPreset,
  type PrintConfig,
  type LayoutPreset,
  type FontSizesOverride,
  type VisibleSections,
} from "@/lib/print-config";
import { buildReceiptHtml, buildSenhaHtml, printReceipt, printSenha } from "@/lib/print-receipt";
import { checkBridgeStatus, type BridgeHealth } from "@/lib/thermal-printer";
import PrinterDiagnostics from "./PrinterDiagnostics";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, RotateCcw, AlertTriangle, CheckCircle2, Download, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type PreviewMode = "receipt" | "senha";

const SAMPLE_ITEMS = [
  { product_name: "Espeto Picanha", quantity: 2, product_price: 15.0, note: "Bem passado" },
  { product_name: "Refrigerante Lata", quantity: 1, product_price: 8.5, note: null },
  { product_name: "Cerveja Original", quantity: 3, product_price: 12.0, note: "Bem gelada" },
  { product_name: "Espeto Frango", quantity: 2, product_price: 10.0, note: null },
];
const SAMPLE_TOTAL = 94.5;

const PRESET_LABELS: Record<LayoutPreset, string> = {
  mesa_simples: "Mesa simples",
  classico: "Clássico",
  conta_destacada: "Conta destacada",
};

const FONT_FIELDS: { key: keyof FontSizesOverride; label: string; min: number; max: number; def: number }[] = [
  { key: "title", label: "Título", min: 12, max: 28, def: 20 },
  { key: "header", label: "Cabeçalho (mesa/garçom)", min: 10, max: 22, def: 15 },
  { key: "items", label: "Itens", min: 10, max: 22, def: 15 },
  { key: "notes", label: "Observações", min: 8, max: 18, def: 12 },
  { key: "total", label: "Total", min: 12, max: 32, def: 19 },
];

const SECTION_FIELDS: { key: keyof VisibleSections; label: string }[] = [
  { key: "title", label: "Título do estabelecimento" },
  { key: "waiter", label: "Garçom" },
  { key: "date", label: "Data e hora" },
  { key: "notes", label: "Observações dos itens" },
  { key: "footer", label: "Rodapé" },
];

export default function PrintConfigPanel() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<PrintConfig>(loadPrintConfig);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("receipt");
  const [bridgeStatus, setBridgeStatus] = useState<BridgeHealth | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    syncPrintConfigFromDb().then(setCfg);
  }, []);

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

  const persist = (next: PrintConfig) => {
    setCfg(next);
    savePrintConfig(next);
  };

  const update = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) => {
    persist({ ...cfg, [key]: value });
  };

  const updateFont = (key: keyof FontSizesOverride, value: number) => {
    persist({ ...cfg, fontSizes: { ...cfg.fontSizes, [key]: value } });
  };

  const updateSection = (key: keyof VisibleSections, value: boolean) => {
    persist({ ...cfg, visibleSections: { ...cfg.visibleSections, [key]: value } });
  };

  const handlePreset = (preset: LayoutPreset) => {
    persist(applyPreset(preset, cfg));
    toast({ title: `Modelo aplicado: ${PRESET_LABELS[preset]}` });
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
        success = await printSenha("146", SAMPLE_ITEMS, {
          waiterName: "Carlos",
          orderId: "abcd1234ef56789012114162",
          customerName: "CONSUMIDOR FINAL",
          total: SAMPLE_TOTAL,
          force: true,
        });
      } else {
        success = await printReceipt("Mesa 5", "Carlos", SAMPLE_ITEMS, SAMPLE_TOTAL);
      }
    } catch (e: any) {
      errorMsg = e.message;
    }

    if (success) {
      toast({ title: "Impressão enviada!", description: "O comando foi processado pela ponte." });
    } else {
      toast({
        title: "Erro na Impressão",
        description: cfg.printMode === "bridge"
          ? (errorMsg || "Ponte local indisponível ou impressora desconectada.")
          : "No modo Navegador a impressão real não é executada — use a ponte local para imprimir de verdade.",
        variant: "destructive",
      });
    }
  };

  const previewHtml = useMemo(() => {
    if (previewMode === "senha")
      return buildSenhaHtml("146", SAMPLE_ITEMS, cfg, {
        waiterName: "Carlos",
        orderId: "abcd1234ef56789012114162",
        customerName: "CONSUMIDOR FINAL",
        total: SAMPLE_TOTAL,
      });
    return buildReceiptHtml("Mesa 5", "Carlos", SAMPLE_ITEMS, SAMPLE_TOTAL, cfg);
  }, [cfg, previewMode]);

  const pxWidth = cfg.paperWidth === "58mm" ? 219 : 302;

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full">
      {/* LEFT: Visual editor */}
      <div className="flex-1 space-y-6 min-w-0 max-w-md">

        {/* Modelo predefinido */}
        <section className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Modelo do cupom</Label>
          <Select value={cfg.layoutPreset} onValueChange={(v) => handlePreset(v as LayoutPreset)}>
            <SelectTrigger className="font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRESET_LABELS) as LayoutPreset[]).map((k) => (
                <SelectItem key={k} value={k}>{PRESET_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Aplica um layout-base. Você pode ajustar tudo abaixo.</p>
        </section>

        {/* Largura */}
        <section className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Largura do papel</Label>
          <div className="flex gap-2">
            {(["58mm", "80mm"] as const).map((w) => (
              <Button
                key={w}
                variant={cfg.paperWidth === w ? "default" : "outline"}
                className="flex-1 font-bold"
                onClick={() => update("paperWidth", w)}
              >{w}</Button>
            ))}
          </div>
        </section>

        {/* Alinhamento do conteúdo */}
        <section className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Alinhamento do conteúdo</Label>
          <div className="flex gap-2">
            {([
              { v: "left", label: "Esquerda" },
              { v: "center", label: "Centralizado" },
            ] as const).map((opt) => (
              <Button
                key={opt.v}
                variant={cfg.contentAlign === opt.v ? "default" : "outline"}
                className="flex-1 font-bold"
                onClick={() => update("contentAlign", opt.v)}
              >{opt.label}</Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Aplica a mesa, itens e total. Título e rodapé sempre centralizados.</p>
        </section>

        {/* Fontes por seção */}
        <section className="space-y-3 p-4 rounded-lg bg-secondary/40 border">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tamanho das fontes</Label>
          {FONT_FIELDS.map((f) => {
            const value = cfg.fontSizes[f.key] ?? f.def;
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold">{f.label}</span>
                  <span className="font-mono text-muted-foreground">{value}px</span>
                </div>
                <Slider
                  min={f.min}
                  max={f.max}
                  step={1}
                  value={[value]}
                  onValueChange={([v]) => updateFont(f.key, v)}
                />
              </div>
            );
          })}
        </section>

        {/* Visibilidade */}
        <section className="space-y-3 p-4 rounded-lg bg-secondary/40 border">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mostrar / ocultar</Label>
          {SECTION_FIELDS.map((s) => (
            <div key={s.key} className="flex items-center justify-between">
              <span className="text-sm font-medium">{s.label}</span>
              <Switch
                checked={cfg.visibleSections[s.key]}
                onCheckedChange={(v) => updateSection(s.key, v)}
              />
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <span className="text-sm font-medium">Imprimir senha automaticamente no BALCÃO</span>
            <Switch
              checked={cfg.printSenhaEnabled}
              onCheckedChange={(v) => update("printSenhaEnabled", v)}
            />
          </div>
        </section>

        {/* Textos */}
        <section className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Título</Label>
            <input
              type="text"
              value={cfg.headerText}
              onChange={(e) => update("headerText", e.target.value)}
              className="w-full p-2 text-sm border rounded bg-white font-bold focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rodapé</Label>
            <input
              type="text"
              value={cfg.footerText}
              onChange={(e) => update("footerText", e.target.value)}
              className="w-full p-2 text-sm border rounded bg-white focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        </section>

        {/* Modo de impressão (técnico) */}
        <section className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Modo de impressão</Label>
          <div className="flex gap-2">
            {(["browser", "bridge"] as const).map((m) => (
              <Button
                key={m}
                variant={cfg.printMode === m ? "default" : "outline"}
                className="flex-1 font-bold"
                onClick={() => update("printMode", m)}
              >{m === "browser" ? "Navegador" : "Ponte Local"}</Button>
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
                    <RotateCcw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                <span className="text-muted-foreground uppercase">Status:</span>
                {bridgeStatus?.online ? (
                  <div className="flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /><span>PONTE ONLINE</span></div>
                ) : (
                  <div className="flex items-center gap-1.5 text-rose-500"><AlertTriangle className="w-3.5 h-3.5" /><span>PONTE OFFLINE</span></div>
                )}
              </div>

              {bridgeStatus?.online && (
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold pt-1 border-t border-slate-200/50">
                  <span className="text-muted-foreground uppercase">Impressora USB:</span>
                  {bridgeStatus.printer_connected
                    ? <span className="text-emerald-600">DETECTADA</span>
                    : <span className="text-amber-600">NÃO DETECTADA</span>}
                </div>
              )}

              {bridgeStatus?.error && (
                <p className="text-[10px] text-rose-500 font-medium leading-tight">{bridgeStatus.error}</p>
              )}

              <p className="text-[10px] text-muted-foreground leading-relaxed pt-1 border-t border-slate-200/50">
                <Info className="w-3 h-3 inline mr-1 mb-0.5" />
                A janela <strong>Impressao do app</strong> no desktop serve apenas para configurar fila/impressora local.
                A aparência do cupom é configurada aqui.
              </p>

              <div className="pt-1">
                <Button variant="link" className="h-auto p-0 text-[10px] gap-1 text-primary font-bold" asChild>
                  <a href="/bridge/BRIDGE_INSTRUCTIONS.md" target="_blank">
                    <Download className="w-3 h-3" /> VER INSTRUÇÕES DE INSTALAÇÃO
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-[10px] text-amber-700 leading-relaxed">
                <Info className="w-3 h-3 inline mr-1 mb-0.5" />
                No modo <strong>Navegador</strong>, a impressão real não é executada (evita gerar PDF).
                Use a <strong>Ponte Local</strong> para imprimir de verdade.
              </p>
            </div>
          )}
        </section>

        <PrinterDiagnostics
          bridgeUrl={cfg.bridgeUrl}
          onBridgeUrlChange={(url) => setCfg((c) => ({ ...c, bridgeUrl: url, printMode: "bridge" }))}
        />

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

      {/* RIGHT: Live preview */}
      <div className="flex-1 flex flex-col items-center min-w-0">
        <div className="flex gap-2 mb-3">
          <Button size="sm" variant={previewMode === "receipt" ? "default" : "outline"} onClick={() => setPreviewMode("receipt")} className="h-8 text-xs font-bold">Cupom Pedido</Button>
          <Button size="sm" variant={previewMode === "senha" ? "default" : "outline"} onClick={() => setPreviewMode("senha")} className="h-8 text-xs font-bold">Senha Balcão</Button>
        </div>

        <div className="bg-white rounded-lg shadow-xl overflow-hidden mx-auto border-4 border-slate-100 sticky top-4" style={{ width: pxWidth, maxHeight: 700 }}>
          <iframe
            title="Print Preview"
            srcDoc={previewHtml}
            style={{ width: pxWidth, minHeight: 400, maxHeight: 700, border: "none", display: "block" }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 uppercase font-bold tracking-widest">
          Pré-visualização ({cfg.paperWidth}) — atualiza ao vivo
        </p>
      </div>
    </div>
  );
}
