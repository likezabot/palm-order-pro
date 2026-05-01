/**
 * PrintConfigPanel — redirecionamento para a nova página de configurações.
 *
 * O painel de impressão foi migrado para src/pages/PrinterSettings.tsx.
 * Este componente existe apenas para manter compatibilidade com Admin.tsx.
 */

import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Printer, ArrowRight } from "lucide-react";

export default function PrintConfigPanel() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Printer className="w-8 h-8 text-primary" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">Configurações de Impressão</h2>
        <p className="text-muted-foreground max-w-sm">
          As configurações de impressão foram movidas para uma página dedicada com
          preview ao vivo, ajuste fino de fontes e configuração por tipo de pedido.
        </p>
      </div>

      <Button onClick={() => navigate("/printer-settings")} className="gap-2">
        Abrir Configurações de Impressão <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
