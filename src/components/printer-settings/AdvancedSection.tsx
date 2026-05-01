import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Settings2, Copy, Scissors } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
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
            {/* SEPARADORES */}
            <div className="space-y-3">
              <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-2">
                <Scissors className="w-3 h-3" /> Estilo da linha divisória
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {(["line", "dashes", "stars", "none"] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => onChange({ separatorStyle: style })}
                    className={`p-2 rounded border-2 text-left transition-all hover:bg-muted/50 ${
                      cfg.separatorStyle === style ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase mb-1">{style === "line" ? "Linha" : style === "dashes" ? "Traços" : style === "stars" ? "Estrelas" : "Nenhum"}</div>
                    <div className="font-mono text-[10px] opacity-60">
                      {style === "line" ? "————————————————" : style === "dashes" ? "----------------" : style === "stars" ? "****************" : " (espaço vazio)"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* VIAS PADRÃO */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-2">
                  <Copy className="w-3 h-3" /> Vias impressas por padrão
                </Label>
                <span className="text-xs font-mono font-bold text-primary">{cfg.copiesDefault || 1} via(s)</span>
              </div>
              <Slider 
                min={1} 
                max={5} 
                step={1} 
                value={[cfg.copiesDefault || 1]} 
                onValueChange={([v]) => onChange({ copiesDefault: v })} 
              />
              <p className="text-[10px] text-muted-foreground">Quantas vezes o mesmo cupom sai na impressora.</p>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border/50">
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
