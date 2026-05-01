import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Utensils, Store, Truck, Printer, Copy, Zap, Settings2 } from "lucide-react";
import type { PrintConfig, PerTypeConfig } from "@/lib/print-config";

interface Props {
  cfg: PrintConfig;
  onChange: (patch: Partial<PrintConfig>) => void;
}

export default function PerTypeSection({ cfg, onChange }: Props) {
  const updatePerType = (type: "mesa" | "balcao" | "delivery", patch: Partial<PerTypeConfig>) => {
    const currentPerType = cfg.perType || {};
    const currentTypeCfg = currentPerType[type] || {};
    
    onChange({
      perType: {
        ...currentPerType,
        [type]: { ...currentTypeCfg, ...patch }
      }
    });
  };

  const renderConfig = (type: "mesa" | "balcao" | "delivery") => {
    const typeCfg = cfg.perType?.[type] || {};

    return (
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between gap-4 py-2 border-b border-border/50">
          <div className="flex-1 min-w-0">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" /> Auto-imprimir
            </Label>
            <p className="text-[10px] text-muted-foreground">Sobrescreve a configuração global de impressão automática.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground italic">
              {typeCfg.autoPrint === undefined ? "Usar global" : typeCfg.autoPrint ? "Sempre" : "Nunca"}
            </span>
            <Switch
              checked={typeCfg.autoPrint ?? (type === "mesa" ? cfg.autoPrintNewOrders : type === "balcao" ? cfg.printSenhaEnabled : cfg.autoPrintNewOrders)}
              onCheckedChange={(v) => updatePerType(type, { autoPrint: v })}
            />
            {typeCfg.autoPrint !== undefined && (
              <button 
                onClick={() => updatePerType(type, { autoPrint: undefined })}
                className="text-[10px] text-primary hover:underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5 py-2 border-b border-border/50">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Copy className="w-3.5 h-3.5" /> Vias impressas
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={5}
                className="w-16 h-8 text-center text-xs"
                value={typeCfg.copies ?? ""}
                placeholder={String(cfg.copiesDefault || 1)}
                onChange={(e) => {
                  const val = e.target.value === "" ? undefined : parseInt(e.target.value);
                  updatePerType(type, { copies: val });
                }}
              />
              {typeCfg.copies !== undefined && (
                <button 
                  onClick={() => updatePerType(type, { copies: undefined })}
                  className="text-[10px] text-primary hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Número de cópias para este tipo de pedido.</p>
        </div>

        <div className="space-y-1.5 py-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Printer className="w-3.5 h-3.5" /> Nome da impressora
            </Label>
            {typeCfg.printerName !== undefined && (
              <button 
                onClick={() => updatePerType(type, { printerName: undefined })}
                className="text-[10px] text-primary hover:underline"
              >
                Reset
              </button>
            )}
          </div>
          <Input
            className="h-8 text-xs font-mono"
            value={typeCfg.printerName || ""}
            placeholder="Ex: Cozinha (Opcional)"
            onChange={(e) => updatePerType(type, { printerName: e.target.value || undefined })}
          />
          <p className="text-[10px] text-muted-foreground">Se preenchido, envia para esta impressora específica na bridge.</p>
        </div>
      </div>
    );
  };

  return (
    <Card className="w-full border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Settings2 className="w-4 h-4" /> Configuração por Tipo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="mesa">
          <TabsList className="grid grid-cols-3 w-full mb-2">
            <TabsTrigger value="mesa" className="gap-1.5 text-xs">
              <Utensils className="w-3 h-3" /> Mesa
            </TabsTrigger>
            <TabsTrigger value="balcao" className="gap-1.5 text-xs">
              <Store className="w-3 h-3" /> Balcão
            </TabsTrigger>
            <TabsTrigger value="delivery" className="gap-1.5 text-xs">
              <Truck className="w-3 h-3" /> Delivery
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="mesa">{renderConfig("mesa")}</TabsContent>
          <TabsContent value="balcao">{renderConfig("balcao")}</TabsContent>
          <TabsContent value="delivery">{renderConfig("delivery")}</TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

