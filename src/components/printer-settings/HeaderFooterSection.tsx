import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Type, ImagePlus, Loader2, X, Phone, Building2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PrintConfig } from "@/lib/print-config";

interface Props {
  cfg: PrintConfig;
  onChange: (patch: Partial<PrintConfig>) => void;
}

export default function HeaderFooterSection({ cfg, onChange }: Props) {
  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Type className="w-4 h-4" /> Texto do talão
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase font-bold text-muted-foreground">
            Nome do estabelecimento
          </Label>
          <Input
            value={cfg.headerText}
            onChange={(e) => onChange({ headerText: e.target.value })}
            placeholder="PLANO B ESPETARIA"
          />
          <p className="text-[11px] text-muted-foreground">
            Aparece no topo de todos os talões.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase font-bold text-muted-foreground">
            Texto do rodapé (opcional)
          </Label>
          <Input
            value={cfg.footerText}
            onChange={(e) => onChange({ footerText: e.target.value })}
            placeholder="Obrigado pela preferência!"
          />
          <p className="text-[11px] text-muted-foreground">
            Aparece no final do talão. Deixe vazio para omitir.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
