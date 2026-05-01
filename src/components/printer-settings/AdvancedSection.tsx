import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Settings2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { PrintConfig } from "@/lib/print-config";

interface Props {
  cfg: PrintConfig;
  onChange: (patch: Partial<PrintConfig>) => void;
}

export default function AdvancedSection({ cfg, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors rounded-lg"
          >
            <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
              <Settings2 className="w-4 h-4" /> Configurações avançadas
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold text-muted-foreground">URL da bridge</Label>
              <Input
                value={cfg.bridgeUrl}
                onChange={(e) => onChange({ bridgeUrl: e.target.value })}
                placeholder="http://localhost:9100"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Não alterar a menos que o app desktop use outra porta. Configuração local por dispositivo.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold text-muted-foreground">Modo de impressão</Label>
              <Select value={cfg.printMode} onValueChange={(v) => onChange({ printMode: v as "bridge" | "browser" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bridge">Bridge (app desktop)</SelectItem>
                  <SelectItem value="browser">Navegador (PDF/sistema)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Configuração local por dispositivo.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
