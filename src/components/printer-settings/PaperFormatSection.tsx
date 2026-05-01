import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Maximize2 } from "lucide-react";
import type { PrintConfig, PaperWidth, PrintSize, ContentAlign } from "@/lib/print-config";

interface Props {
  cfg: PrintConfig;
  onChange: (patch: Partial<PrintConfig>) => void;
}

function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          size="sm"
          variant={value === opt.value ? "default" : "outline"}
          className="flex-1 font-bold"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

export default function PaperFormatSection({ cfg, onChange }: Props) {
  return (
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
              { value: "58mm", label: "58mm" },
              { value: "80mm", label: "80mm" },
            ]}
            value={cfg.paperWidth}
            onChange={(v) => onChange({ paperWidth: v })}
          />
          <p className="text-[11px] text-muted-foreground">
            58mm = 32 colunas • 80mm = 48 colunas
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase font-bold text-muted-foreground">Tamanho da fonte</Label>
          <ButtonGroup<PrintSize>
            options={[
              { value: "normal", label: "Normal" },
              { value: "grande", label: "Grande" },
            ]}
            value={cfg.printSize}
            onChange={(v) => onChange({ printSize: v })}
          />
          <p className="text-[11px] text-muted-foreground">
            Grande facilita a leitura na cozinha.
          </p>
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
  );
}
