import { useNavigate } from "react-router-dom";
import { Settings, AlertCircle, Printer, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { printTest, getPaperWidth, setPaperWidth } from "@/lib/print-receipt";

export const PrintSettingsDialog = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="admin-only p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground">
          <Settings size={24} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configurações de Impressão
          </DialogTitle>
          <DialogDescription>
            Configure a largura do papel e faça testes de impressão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50">
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              <strong>✅ Impressão automática ATIVA</strong> — pedidos novos e atualizações são impressos automaticamente nesta tela.
              O botão abaixo serve apenas para reimpressão manual.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              Largura do Papel
            </h3>
            <div className="flex gap-2">
              {(["58mm", "80mm"] as const).map((w) => (
                <Button
                  key={w}
                  variant={getPaperWidth() === w ? "default" : "outline"}
                  className="flex-1 font-bold"
                  onClick={() => {
                    setPaperWidth(w);
                    toast({ title: `Papel alterado para ${w}` });
                  }}
                >
                  {w}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <AlertCircle className="w-4 h-4" />
              Como configurar impressora
            </h3>
            <div className="space-y-2 text-sm bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-100 dark:border-amber-900/50">
              <p>1. No Windows, defina sua <strong>Impressora Térmica</strong> como <strong>Padrão</strong>.</p>
              <p>2. Nas configurações de impressão do navegador, desmarque <strong>"Cabeçalhos e rodapés"</strong>.</p>
              <p>3. Impressão silenciosa (sem diálogo) requer <strong>modo kiosk</strong> ou <strong>app desktop</strong>.</p>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full gap-2 font-bold"
              onClick={async () => {
                const ok = await printTest();
                if (ok) {
                  toast({ title: "Teste enviado!", description: "Verifique o cupom na impressora." });
                } else {
                  toast({
                    title: "Impressão bloqueada",
                    description: "O modo navegador não permite imprimir. Mude para o modo app desktop/ponte.",
                    variant: "destructive",
                  });
                }
              }}
            >
              <Printer className="w-4 h-4" />
              🖨️ IMPRIMIR TESTE
            </Button>

            <Button
              variant="secondary"
              className="w-full gap-2 font-bold"
              onClick={() => navigate("/print-station")}
            >
              <RefreshCw className="w-4 h-4" />
              ABRIR ESTAÇÃO DE IMPRESSÃO
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
