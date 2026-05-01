import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Maximize2, LayoutTemplate, Type } from "lucide-react";
import { applyPreset } from "@/lib/print-config";
import type { PrintConfig, PaperWidth, PrintSize, ContentAlign, LayoutPreset } from "@/lib/print-config";

interface Props {
  cfg: PrintConfig;
  onChange: (patch: Partial<PrintConfig>) => void;
}

function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          size="sm"
          variant={value === opt.value ? "default" : "outline"}
          className="flex-1 min-w-[60px] font-bold"
          onClick={() => onChange(opt.value)}
          title={opt.desc}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

const PRESET_LABELS: Record<LayoutPreset, { label: string; desc: string }> = {
  classico: { label: "Clássico", desc: "Completo: nome, garçom, data, total" },
  mesa_simples: { label: "Mesa Simples", desc: "Enxuto: sem garçom e sem data" },
  conta_destacada: { label: "Conta Destacada", desc: "Total em fonte grande para fechamento" },
};

export default function PaperFormatSection({ cfg, onChange }: Props) {
  const hasFontOverrides =
    cfg.fontSizes && Object.keys(cfg.fontSizes).some((k) => cfg.fontSizes[k as keyof typeof cfg.fontSizes] != null);

  return (
    <div className="space-y-4 w-full">
      {/* === PAPEL E FORMATO === */}
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
            <Maximize2 className="w-4 h-4" /> Papel e Formato
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs uppercase font-bold text-muted-foreground">Largura do papel</Label>
            <ButtonGroup<PaperWidth>
              options={[
                { value: "58mm", label: "58mm", desc: "32 colunas" },
                { value: "80mm", label: "80mm", desc: "48 colunas" },
              ]}
              value={cfg.paperWidth}
              onChange={(v) => onChange({ paperWidth: v })}
            />
            <p className="text-[11px] text-muted-foreground">58mm = 32 colunas • 80mm = 48 colunas</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-bold text-muted-foreground">Alinhamento do conteúdo</Label>
            <ButtonGroup<ContentAlign>
              options={[
                { value: "left", label: "Esquerdo" },
                { value: "center", label: "Centralizado" },
              ]}
              value={cfg.contentAlign}
              onChange={(v) => onChange({ contentAlign: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* === PRESET DE LAYOUT === */}
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4" /> Modelo de Layout
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            {(Object.keys(PRESET_LABELS) as LayoutPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onChange(applyPreset(preset, cfg))}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                  cfg.layoutPreset === preset
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                <div className="font-bold text-sm">{PRESET_LABELS[preset].label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{PRESET_LABELS[preset].desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Aplicar um modelo ajusta automaticamente fontes e seções visíveis.
          </p>
        </CardContent>
      </Card>

      {/* === TAMANHO DE FONTE === */}
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
            <Type className="w-4 h-4" /> Tamanho de Fonte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs uppercase font-bold text-muted-foreground">Tamanho base</Label>
            <ButtonGroup<PrintSize>
              options={[
                { value: "pequeno", label: "Pequeno", desc: "11px base" },
                { value: "normal", label: "Normal", desc: "13px base" },
                { value: "grande", label: "Grande", desc: "15px base" },
                { value: "extra", label: "Extra", desc: "17px base" },
              ]}
              value={cfg.printSize}
              onChange={(v) => onChange({ printSize: v, fontSizes: {} })}
            />
            <p className="text-[11px] text-muted-foreground">
              Pequeno (11px) • Normal (13px) • Grande (15px) • Extra (17px)
            </p>
          </div>

          {/* Ajustes finos por elemento */}
          <div className="space-y-4 pt-2 border-t border-border">
            <Label className="text-xs uppercase font-bold text-muted-foreground">Ajuste fino por elemento</Label>

            <FontSlider
              label="Cabeçalho (nome do estabelecimento)"
              value={cfg.fontSizes?.title}
              defaultValue={cfg.printSize === "extra" ? 24 : cfg.printSize === "grande" ? 20 : cfg.printSize === "pequeno" ? 14 : 16}
              min={10}
              max={36}
              onChange={(v) => onChange({ fontSizes: { ...cfg.fontSizes, title: v } })}
              onReset={() => onChange({ fontSizes: { ...cfg.fontSizes, title: undefined } })}
            />

            <FontSlider
              label="Itens do pedido"
              value={cfg.fontSizes?.items}
              defaultValue={cfg.printSize === "extra" ? 17 : cfg.printSize === "grande" ? 15 : cfg.printSize === "pequeno" ? 11 : 13}
              min={8}
              max={24}
              onChange={(v) => onChange({ fontSizes: { ...cfg.fontSizes, items: v } })}
              onReset={() => onChange({ fontSizes: { ...cfg.fontSizes, items: undefined } })}
            />

            <FontSlider
              label="Total"
              value={cfg.fontSizes?.total}
              defaultValue={cfg.printSize === "extra" ? 22 : cfg.printSize === "grande" ? 19 : cfg.printSize === "pequeno" ? 13 : 16}
              min={10}
              max={40}
              onChange={(v) => onChange({ fontSizes: { ...cfg.fontSizes, total: v } })}
              onReset={() => onChange({ fontSizes: { ...cfg.fontSizes, total: undefined } })}
            />

            <FontSlider
              label="Observações dos itens"
              value={cfg.fontSizes?.notes}
              defaultValue={cfg.printSize === "extra" ? 14 : cfg.printSize === "grande" ? 12 : cfg.printSize === "pequeno" ? 9 : 10}
              min={7}
              max={18}
              onChange={(v) => onChange({ fontSizes: { ...cfg.fontSizes, notes: v } })}
              onReset={() => onChange({ fontSizes: { ...cfg.fontSizes, notes: undefined } })}
            />

            {hasFontOverrides && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground w-full"
                onClick={() => onChange({ fontSizes: {} })}
              >
                ↺ Redefinir todos os ajustes finos
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FontSlider({
  label,
  value,
  defaultValue,
  min,
  max,
  onChange,
  onReset,
}: {
  label: string;
  value: number | undefined;
  defaultValue: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const current = value ?? defaultValue;
  const isCustom = value != null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-foreground">{label}</Label>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono font-bold ${isCustom ? "text-primary" : "text-muted-foreground"}`}>
            {current}px
          </span>
          {isCustom && (
            <button
              type="button"
              onClick={onReset}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              padrão
            </button>
          )}
        </div>
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[current]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}
