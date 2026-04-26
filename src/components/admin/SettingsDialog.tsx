import { useEffect, useState } from "react";
import { Settings, AlertCircle, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useFeedback } from "@/hooks/use-feedback";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  autoPrint: boolean;
  onAutoPrintChange: (v: boolean) => void;
}

export const SettingsDialog = ({ autoPrint, onAutoPrintChange }: Props) => {
  const navigate = useNavigate();
  const { playFeedback } = useFeedback();
  const { toast } = useToast();
  const [tableCount, setTableCount] = useState(10);
  const [savingTables, setSavingTables] = useState(false);

  useEffect(() => {
    supabase
      .from("settings")
      .select("value")
      .eq("key", "table_count")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTableCount(Number(data.value));
      });
  }, []);

  const saveTables = async () => {
    setSavingTables(true);
    const { error } = await supabase
      .from("settings")
      .update({ value: String(tableCount) })
      .eq("key", "table_count");
    setSavingTables(false);
    if (error) {
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } else {
      playFeedback("success");
      toast({ title: `Mesas atualizadas para ${tableCount}` });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          onClick={() => playFeedback("click")}
          className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground mr-2 admin-only"
        >
          <Settings size={24} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configurações Gerais
          </DialogTitle>
          <DialogDescription>Configure mesas e impressão do sistema.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
            <div className="space-y-0.5">
              <Label className="text-base font-bold">Impressão Automática</Label>
              <p className="text-xs text-muted-foreground">
                Imprime novos pedidos assim que chegam
              </p>
            </div>
            <Switch
              checked={autoPrint}
              onCheckedChange={(val) => {
                playFeedback("click");
                onAutoPrintChange(val);
              }}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <AlertCircle className="w-4 h-4" />
              Como configurar impressora
            </h3>
            <div className="space-y-2 text-sm bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-100 dark:border-amber-900/50">
              <p>
                1. No Windows, defina sua <strong>Impressora Térmica</strong> como{" "}
                <strong>Padrão</strong>.
              </p>
              <p>
                2. Certifique-se de <strong>permitir pop-ups</strong> neste site.
              </p>
              <p>
                3. Nas configurações de impressão do navegador, desmarque a opção
                "Cabeçalhos e rodapés".
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              Mesas do Restaurante
            </h3>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
              <button
                onClick={() => setTableCount((c) => Math.max(1, c - 1))}
                className="w-10 h-10 rounded-lg bg-card border border-border flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
              >
                −
              </button>
              <span className="text-2xl font-black text-foreground flex-1 text-center">
                {tableCount}
              </span>
              <button
                onClick={() => setTableCount((c) => Math.min(30, c + 1))}
                className="w-10 h-10 rounded-lg bg-card border border-border flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
              >
                +
              </button>
            </div>
            <Button
              variant="default"
              className="w-full font-bold"
              disabled={savingTables}
              onClick={saveTables}
            >
              {savingTables ? "Salvando..." : "SALVAR MESAS"}
            </Button>
          </div>

          <Button
            variant="secondary"
            className="w-full gap-2 font-bold"
            onClick={() => navigate("/print-station")}
          >
            <RefreshCw className="w-4 h-4" />
            ABRIR ESTAÇÃO DE IMPRESSÃO
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
