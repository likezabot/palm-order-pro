import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/hooks/use-feedback";
import { useToast } from "@/hooks/use-toast";
import { getAppVersion } from "@/lib/version-check";

export const SystemTab = () => {
  const { playFeedback } = useFeedback();
  const { toast } = useToast();

  const handleForceUpdate = async () => {
    if (!confirm("Forçar atualização? A página será recarregada.")) return;
    playFeedback("heavy");
    toast({ title: "Atualizando…", description: "Limpando cache e recarregando." });
    const { forceUpdate } = await import("@/lib/force-update");
    await forceUpdate();
  };

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-6">
      <div className="rounded-xl border-2 border-border p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <RefreshCw className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-lg text-slate-900">Forçar atualização</h3>
            <p className="text-sm text-slate-600 mt-1">
              Limpa cache, desregistra o service worker e recarrega a página. Use
              quando o tablet ficar travado em uma versão antiga.
            </p>
          </div>
        </div>
        <Button
          onClick={handleForceUpdate}
          className="w-full h-14 font-black text-base gap-2"
          variant="destructive"
        >
          <RefreshCw className="w-5 h-5" /> FORÇAR ATUALIZAÇÃO
        </Button>
        <p className="text-xs text-slate-500 text-center font-mono">
          Versão atual: {getAppVersion()}
        </p>
      </div>
    </div>
  );
};

export default SystemTab;
