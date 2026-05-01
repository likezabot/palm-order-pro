import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Eye } from "lucide-react";
import type { PrintConfig, VisibleSections } from "@/lib/print-config";

interface Props {
  cfg: PrintConfig;
  onChange: (patch: Partial<PrintConfig>) => void;
}

const ROWS: { key: keyof VisibleSections; label: string }[] = [
  { key: "waiter", label: "Mostrar nome do garçom" },
  { key: "date", label: "Mostrar data e hora" },
  { key: "showOrderNumber", label: "Mostrar número do pedido" },
  { key: "notes", label: "Mostrar observações do pedido" },
  { key: "footer", label: "Mostrar rodapé" },
];

export default function VisibleSectionsSection({ cfg, onChange }: Props) {
  const setKey = (k: keyof VisibleSections, v: boolean) =>
    onChange({ visibleSections: { ...cfg.visibleSections, [k]: v } });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Eye className="w-4 h-4" /> O que mostrar no talão
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {ROWS.map((r) => (
          <div
            key={r.key}
            className="flex items-center justify-between py-2.5 border-b border-border last:border-0"
          >
            <Label htmlFor={`vis-${r.key}`} className="text-sm font-medium cursor-pointer">
              {r.label}
            </Label>
            <Switch
              id={`vis-${r.key}`}
              checked={!!cfg.visibleSections[r.key]}
              onCheckedChange={(v) => setKey(r.key, v)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
