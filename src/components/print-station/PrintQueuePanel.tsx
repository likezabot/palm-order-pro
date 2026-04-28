import { useState } from "react";
import { Inbox, RefreshCw, Trash2, ChevronDown, ChevronUp, AlertTriangle, Wand2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { usePrintQueue } from "@/hooks/use-print-queue";
import { clearPrintQueue, PRINT_QUEUE_MAX_ATTEMPTS } from "@/lib/print-queue";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const TYPE_LABEL: Record<string, string> = {
  full: "Comanda completa",
  delta: "Acréscimo",
  bill: "Conta",
};

export default function PrintQueuePanel() {
  const { jobs, retryNow, refresh } = usePrintQueue();
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  const pending = jobs.filter((j) => !j.dead);
  const dead = jobs.filter((j) => j.dead);
  const total = jobs.length;

  const status: "empty" | "pending" | "dead" =
    dead.length > 0 ? "dead" : pending.length > 0 ? "pending" : "empty";

  const badgeClass =
    status === "empty"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : status === "dead"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : "bg-amber-100 text-amber-800 border-amber-200";

  const handleClear = async () => {
    await clearPrintQueue();
    await refresh();
    toast({ title: "Fila limpa" });
  };

  const handleRetry = async () => {
    toast({ title: "Reprocessando fila..." });
    await retryNow();
  };

  const handleClearOrphans = async () => {
    const { data, error } = await supabase.rpc("force_clear_orphan_prints");
    if (error) {
      toast({ variant: "destructive", title: "Erro ao limpar órfãos", description: error.message });
      return;
    }
    const cleared = (data as { cleared?: number } | null)?.cleared ?? 0;
    toast({
      title: cleared > 0 ? `${cleared} órfão(s) marcado(s) como impressos` : "Nenhum órfão encontrado",
      description: "Pedidos pagos com impressão pendente foram resolvidos no banco.",
    });
    await refresh();
  };

  return (
    <div className="border-b border-slate-100 bg-white">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-slate-100 p-2 rounded-lg shrink-0">
            <Inbox className="w-5 h-5 text-slate-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800 text-sm">Fila de retry</span>
              <Badge variant="outline" className={`text-[10px] font-bold border ${badgeClass}`}>
                {status === "empty" ? "OK" : `${total} ${total === 1 ? "PENDENTE" : "PENDENTES"}`}
                {dead.length > 0 && ` • ${dead.length} BLOQ.`}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {status === "empty"
                ? "Sem jobs pendentes — bridge saudável."
                : "Modo conservador ativo: itens antigos ficam pausados até limpeza manual."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
            <Link to="/debug/print">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Auditoria</span>
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" title="Marca pedidos pagos com impressão pendente como impressos no banco (não toca na bridge).">
                <Wand2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Limpar órfãos</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar pedidos órfãos?</AlertDialogTitle>
                <AlertDialogDescription>
                  Todos os pedidos <strong>pagos</strong> que ainda estão com impressão "pendente" ou "imprimindo"
                  serão marcados como impressos no banco. Útil quando a bridge ficou offline por muito tempo.
                  <br /><br />
                  <span className="text-muted-foreground">Não interfere na bridge .exe nem na fila local.</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearOrphans}>Limpar órfãos</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {total > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={handleRetry} className="h-8 gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                 <span className="hidden sm:inline">Verificar</span>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-destructive hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Limpar</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar fila de impressão?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Todos os {total} jobs pendentes serão descartados. Pedidos não impressos
                      permanecerão marcados como "falha" no banco — você poderá reimprimir manualmente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClear}>Limpar tudo</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} className="h-8 w-8 p-0">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </>
          )}
        </div>
      </div>

      {expanded && total > 0 && (
        <div className="px-4 pb-4 space-y-2 max-h-64 overflow-auto">
          {jobs.map((job) => (
            <div
              key={job.id}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-xs ${
                job.dead
                  ? "bg-destructive/5 border-destructive/20"
                  : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800">Mesa {job.tableName}</span>
                  <Badge variant="outline" className="text-[9px] font-bold uppercase">
                    {TYPE_LABEL[job.printType] || job.printType}
                  </Badge>
                  {job.dead && (
                    <Badge variant="destructive" className="text-[9px] font-bold gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      BLOQUEADO
                    </Badge>
                  )}
                </div>
                <div className="text-slate-500 mt-0.5">
                  Tentativas: <strong>{job.attempts}/{PRINT_QUEUE_MAX_ATTEMPTS}</strong>
                  {job.lastError && <> • <span className="text-destructive">{job.lastError}</span></>}
                </div>
              </div>
              <div className="text-[10px] text-slate-400 shrink-0">
                {new Date(job.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
