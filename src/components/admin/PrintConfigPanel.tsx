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
import { checkBridgeStatus } from "@/lib/thermal-printer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Printer,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Download,
  Info,
  FileText,
  Type,
  Eye,
  Settings2,
  Layout,
} from "lucide-react";
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

const SectionHeader = ({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileText;
  title: string;
  description?: string;
}) => (
  <div className="flex items-start gap-3">
    <div className="rounded-full bg-primary/10 p-2 shrink-0">
      <Icon className="w-4 h-4 text-primary" />
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      )}
    </div>
  </div>
);

export default function PrintConfigPanel() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<PrintConfig>(loadPrintConfig);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("receipt");
  const [bridgeStatus, setBridgeStatus] = useState<{ online: boolean; printer_connected: boolean; error?: string } | null>(null);
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
        {/* Modo de impressão (status banner igual NetworkTab) */}
        <Card className="p-5 space-y-4">
          <SectionHeader
            icon={Settings2}
            title="Modo de impressão"
            description="Define como os cupons são enviados"
          />
          <div className="flex gap-2">
            {(["browser", "bridge"] as const).map((m) => (
              <Button
                key={m}
                variant={cfg.printMode === m ? "default" : "outline"}
                className="flex-1 h-10 font-medium"
                onClick={() => update("printMode", m)}
              >
                {m === "browser" ? "Navegador" : "Ponte Local"}
              </Button>
            ))}
          </div>

          {cfg.printMode === "bridge" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  URL da Ponte Local
                </Label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cfg.bridgeUrl}
                    onChange={(e) => update("bridgeUrl", e.target.value)}
                    className="flex-1 h-9 px-3 text-xs border border-border rounded-md bg-background font-mono focus:ring-2 focus:ring-ring outline-none"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => verifyBridge(cfg.bridgeUrl)}
                    disabled={checking}
                    className="h-9 w-9 shrink-0"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              {/* Banner de status */}
              {bridgeStatus?.online ? (
                <div className="rounded-lg border border-success/20 bg-success/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-success">
                    <CheckCircle2 className="w-4 h-4" />
                    Ponte online
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Impressora USB:</span>
                    {bridgeStatus.printer_connected ? (
                      <span className="font-medium text-success">Detectada</span>
                    ) : (
                      <span className="font-medium text-warning">Não detectada</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    Ponte offline
                  </div>
                  {bridgeStatus?.error && (
                    <p className="text-xs text-destructive/80 leading-relaxed">
                      {bridgeStatus.error}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  A janela <strong className="text-foreground">Impressão do app</strong> no
                  desktop serve apenas para configurar fila/impressora local. A aparência do
                  cupom é configurada aqui.
                </span>
              </div>

              <Button variant="link" className="h-auto p-0 text-xs gap-1 text-primary font-medium" asChild>
                <a href="/bridge/BRIDGE_INSTRUCTIONS.md" target="_blank">
                  <Download className="w-3 h-3" /> Ver instruções de instalação
                </a>
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
              <div className="flex items-start gap-2 text-xs text-warning leading-relaxed">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  No modo <strong>Navegador</strong>, a impressão real não é executada
                  (evita gerar PDF). Use a <strong>Ponte Local</strong> para imprimir de
                  verdade.
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Layout */}
        <Card className="p-5 space-y-4">
          <SectionHeader
            icon={Layout}
            title="Layout do cupom"
            description="Modelo, largura e alinhamento"
          />

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Modelo</Label>
            <Select value={cfg.layoutPreset} onValueChange={(v) => handlePreset(v as LayoutPreset)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRESET_LABELS) as LayoutPreset[]).map((k) => (
                  <SelectItem key={k} value={k}>{PRESET_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Largura do papel</Label>
            <div className="flex gap-2">
              {(["58mm", "80mm"] as const).map((w) => (
                <Button
                  key={w}
                  variant={cfg.paperWidth === w ? "default" : "outline"}
                  className="flex-1 h-9 font-medium"
                  onClick={() => update("paperWidth", w)}
                >
                  {w}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Alinhamento</Label>
            <div className="flex gap-2">
              {([
                { v: "left", label: "Esquerda" },
                { v: "center", label: "Centralizado" },
              ] as const).map((opt) => (
                <Button
                  key={opt.v}
                  variant={cfg.contentAlign === opt.v ? "default" : "outline"}
                  className="flex-1 h-9 font-medium"
                  onClick={() => update("contentAlign", opt.v)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Aplica a mesa, itens e total. Título e rodapé sempre centralizados.
            </p>
          </div>
        </Card>

        {/* Fontes */}
        <Card className="p-5 space-y-4">
          <SectionHeader
            icon={Type}
            title="Tamanho das fontes"
            description="Ajuste por seção em pixels"
          />
          <div className="space-y-3">
            {FONT_FIELDS.map((f) => {
              const value = cfg.fontSizes[f.key] ?? f.def;
              return (
                <div key={f.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{f.label}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">{value}px</span>
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
          </div>
        </Card>

        {/* Visibilidade */}
        <Card className="p-5 space-y-4">
          <SectionHeader
            icon={Eye}
            title="Mostrar / ocultar"
            description="Seções visíveis no cupom"
          />
          <div className="space-y-2.5">
            {SECTION_FIELDS.map((s) => (
              <div key={s.key} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{s.label}</span>
                <Switch
                  checked={cfg.visibleSections[s.key]}
                  onCheckedChange={(v) => updateSection(s.key, v)}
                />
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
              <span className="text-sm text-foreground pr-3">
                Imprimir senha automaticamente no balcão
              </span>
              <Switch
                checked={cfg.printSenhaEnabled}
                onCheckedChange={(v) => update("printSenhaEnabled", v)}
              />
            </div>
          </div>
        </Card>

        {/* Textos */}
        <Card className="p-5 space-y-4">
          <SectionHeader
            icon={FileText}
            title="Textos personalizados"
            description="Título e rodapé do cupom"
          />
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Título</Label>
              <input
                type="text"
                value={cfg.headerText}
                onChange={(e) => update("headerText", e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background focus:ring-2 focus:ring-ring outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Rodapé</Label>
              <input
                type="text"
                value={cfg.footerText}
                onChange={(e) => update("footerText", e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background focus:ring-2 focus:ring-ring outline-none"
              />
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-10 gap-2 font-medium" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" /> Resetar
          </Button>
          <Button className="flex-1 h-10 gap-2 font-medium" onClick={handleTestPrint}>
            <Printer className="w-4 h-4" /> Testar
          </Button>
        </div>
      </div>

      {/* RIGHT: Live preview */}
      <div className="flex-1 flex flex-col items-center min-w-0">
        <Card className="p-5 w-full max-w-md flex flex-col items-center gap-4 sticky top-4">
          <SectionHeader
            icon={Eye}
            title="Pré-visualização"
            description={`Atualiza ao vivo · ${cfg.paperWidth}`}
          />

          <div className="flex gap-2">
            <Button
              size="sm"
              variant={previewMode === "receipt" ? "default" : "outline"}
              onClick={() => setPreviewMode("receipt")}
              className="h-9 text-xs font-medium"
            >
              Cupom Pedido
            </Button>
            <Button
              size="sm"
              variant={previewMode === "senha" ? "default" : "outline"}
              onClick={() => setPreviewMode("senha")}
              className="h-9 text-xs font-medium"
            >
              Senha Balcão
            </Button>
          </div>

          <div
            className="bg-white rounded-md overflow-hidden mx-auto border border-border shadow-sm"
            style={{ width: pxWidth, maxHeight: 700 }}
          >
            <iframe
              title="Print Preview"
              srcDoc={previewHtml}
              style={{
                width: pxWidth,
                minHeight: 400,
                maxHeight: 700,
                border: "none",
                display: "block",
              }}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
