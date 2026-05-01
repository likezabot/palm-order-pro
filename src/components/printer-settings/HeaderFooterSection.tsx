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
  const [uploading, setUploading] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo muito grande. Máximo 2MB.");
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('printer-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('printer-assets')
        .getPublicUrl(filePath);

      onChange({ logoUrl: publicUrl });
      toast.success("Logo enviado com sucesso");
    } catch (error: any) {
      toast.error(`Erro no upload: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = () => {
    onChange({ logoUrl: "" });
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Type className="w-4 h-4" /> Cabeçalho e Rodapé
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* LOGO UPLOAD */}
        <div className="space-y-2">
          <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-2">
            <ImagePlus className="w-3 h-3" /> Logotipo do estabelecimento
          </Label>
          
          {cfg.logoUrl ? (
            <div className="relative w-32 h-20 border rounded-lg overflow-hidden group">
              <img src={cfg.logoUrl} alt="Logo" className="w-full h-full object-contain" />
              <button 
                onClick={removeLogo}
                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm" 
                className="relative h-10 px-4"
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ImagePlus className="w-4 h-4 mr-2" />}
                Enviar logo
                <input 
                  type="file" 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                />
              </Button>
              <p className="text-[10px] text-muted-foreground">Recomendado: PNG/JPG até 2MB</p>
            </div>
          )}
        </div>

        {/* NOME */}
        <div className="space-y-1.5">
          <Label className="text-xs uppercase font-bold text-muted-foreground">
            Nome do estabelecimento
          </Label>
          <Input
            value={cfg.headerText}
            onChange={(e) => onChange({ headerText: e.target.value })}
            placeholder="PLANO B ESPETARIA"
          />
        </div>

        {/* ENDEREÇO E CNPJ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> Endereço Linha 1
            </Label>
            <Input
              value={cfg.addressLine1 || ""}
              onChange={(e) => onChange({ addressLine1: e.target.value })}
              placeholder="Rua Exemplo, 123"
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> Endereço Linha 2
            </Label>
            <Input
              value={cfg.addressLine2 || ""}
              onChange={(e) => onChange({ addressLine2: e.target.value })}
              placeholder="Bairro - Cidade/UF"
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> Telefone
            </Label>
            <Input
              value={cfg.phone || ""}
              onChange={(e) => onChange({ phone: e.target.value })}
              placeholder="(00) 00000-0000"
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> CNPJ
            </Label>
            <Input
              value={cfg.cnpj || ""}
              onChange={(e) => onChange({ cnpj: e.target.value })}
              placeholder="00.000.000/0001-00"
              className="text-xs"
            />
          </div>
        </div>

        {/* RODAPÉ */}
        <div className="space-y-1.5 pt-2 border-t border-border/50">
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
