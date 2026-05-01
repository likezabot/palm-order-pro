import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";
import type { PrintConfig } from "@/lib/print-config";

interface Props {
  cfg: PrintConfig;
  onChange: (patch: Partial<PrintConfig>) => void;
}

const ROWS: {
  key: "autoPrintNewOrders" | "printSenhaEnabled" | "autoPrintAcrescimos";
  label: string;
  description: string;
}[] = [
  {
    key: "autoPrintNewOrders",
    label: "Imprimir automaticamente pedidos novos",
    description: "O app desktop imprime assim que um pedido chega.",
  },
  {
    key: "printSenhaEnabled",
    label: "Imprimir senha de cozinha",
    description: "Imprime um segundo talão menor só com o número da senha.",
  },
  {
    key: "autoPrintAcrescimos",
    label: "Imprimir acréscimos automaticamente",
    description: "Quando itens são adicionados a um pedido existente.",
  },
];

export default function AutoPrintSection({ cfg, onChange }: Props) {
  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Zap className="w-4 h-4" /> Impressão Automática
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {ROWS.map((r) => (
          <div
            key={r.key}
            className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0"
          >
            <div className="flex-1 min-w-0">
              <Label htmlFor={`auto-${r.key}`} className="text-sm font-medium cursor-pointer block">
                {r.label}
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">{r.description}</p>
            </div>
            <Switch
              id={`auto-${r.key}`}
              checked={!!cfg[r.key]}
              onCheckedChange={(v) => onChange({ [r.key]: v } as Partial<PrintConfig>)}
              className="mt-0.5"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
