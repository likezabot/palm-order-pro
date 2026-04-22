import { useEffect, useState } from "react";
import { RefreshCw, Archive, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/hooks/use-feedback";
import { useToast } from "@/hooks/use-toast";
import { getAppVersion } from "@/lib/version-check";
import { supabase } from "@/integrations/supabase/client";

type RetentionLog = {
  id: number;
  executed_at: string;
  days_kept: number;
  trigger_source: string;
  status: string;
  result: Record<string, number | string>;
  error_message: string | null;
  duration_ms: number | null;
};

export const SystemTab = () => {
  const { playFeedback } = useFeedback();
  const { toast } = useToast();
  const [archiving, setArchiving] = useState(false);
  const [logs, setLogs] = useState<RetentionLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadLogs = async () => {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from("data_retention_log" as never)
      .select("*")
      .order("executed_at", { ascending: false })
      .limit(20);
    if (!error && data) setLogs(data as unknown as RetentionLog[]);
    setLoadingLogs(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleForceUpdate = async () => {
    if (!confirm("Forçar atualização? A página será recarregada.")) return;
    playFeedback("heavy");
    toast({ title: "Atualizando…", description: "Limpando cache e recarregando." });
    const { forceUpdate } = await import("@/lib/force-update");
    await forceUpdate();
  };

  const handleArchive = async () => {
    if (
      !confirm(
        "Arquivar pedidos pagos com mais de 60 dias? Os dados serão consolidados em histórico diário e os registros detalhados serão apagados.",
      )
    )
      return;
    playFeedback("heavy");
    setArchiving(true);
    try {
      const { data, error } = await supabase.rpc("archive_and_purge_old_data", {
        p_days_keep: 60,
        p_source: "manual",
      } as never);
      if (error) throw error;
      const r = (data as Record<string, number | boolean>) || {};
      toast({
        title: r.idempotent_skip ? "Já executado neste minuto" : "Arquivamento concluído",
        description: `${r.deleted_orders ?? 0} pedidos arquivados · ${r.archived_summary_days ?? 0} dias consolidados · ${r.deleted_inventory_movements ?? 0} mov. estoque limpos`,
      });
      await loadLogs();
    } catch (e) {
      playFeedback("error");
      toast({
        variant: "destructive",
        title: "Falha no arquivamento",
        description: e instanceof Error ? e.message : String(e),
      });
      await loadLogs();
    } finally {
      setArchiving(false);
    }
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

      <div className="rounded-xl border-2 border-border p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Archive className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-lg text-slate-900">
              Arquivar pedidos antigos
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Consolida pedidos pagos com mais de 60 dias em histórico diário
              (por garçom, produto e total) e apaga os registros detalhados.
              Roda automaticamente todo dia às 04:00; use o botão para forçar
              agora.
            </p>
          </div>
        </div>
        <Button
          onClick={handleArchive}
          disabled={archiving}
          className="w-full h-14 font-black text-base gap-2"
        >
          <Archive className="w-5 h-5" />
          {archiving ? "ARQUIVANDO…" : "ARQUIVAR AGORA"}
        </Button>
      </div>

      <div className="rounded-xl border-2 border-border p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <History className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-lg text-slate-900">
              Histórico de arquivamentos
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Últimas 20 execuções (manual ou automática às 04:00).
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={loadLogs}
            disabled={loadingLogs}
          >
            <RefreshCw className={`w-4 h-4 ${loadingLogs ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            {loadingLogs ? "Carregando…" : "Nenhuma execução registrada ainda."}
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.map((log) => {
              const r = log.result || {};
              const ok = log.status === "success";
              return (
                <div
                  key={log.id}
                  className={`rounded-lg border p-3 text-sm ${
                    ok ? "border-border bg-muted/30" : "border-destructive/40 bg-destructive/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-slate-900">
                      {new Date(log.executed_at).toLocaleString("pt-BR")}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded font-mono bg-background border">
                      {log.trigger_source}
                    </span>
                  </div>
                  {ok ? (
                    <div className="text-xs text-slate-600 grid grid-cols-2 gap-x-2">
                      <span>Pedidos: <b>{String(r.deleted_orders ?? 0)}</b></span>
                      <span>Itens: <b>{String(r.deleted_order_items ?? 0)}</b></span>
                      <span>Dias resumo: <b>{String(r.archived_summary_days ?? 0)}</b></span>
                      <span>Garçons: <b>{String(r.archived_waiter_rows ?? 0)}</b></span>
                      <span>Produtos: <b>{String(r.archived_product_rows ?? 0)}</b></span>
                      <span>Mov. estoque: <b>{String(r.deleted_inventory_movements ?? 0)}</b></span>
                    </div>
                  ) : (
                    <p className="text-xs text-destructive font-mono break-all">
                      {log.error_message}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {log.days_kept} dias mantidos · {log.duration_ms ?? 0}ms
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemTab;
