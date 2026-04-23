import { useEffect, useState } from "react";
import { RefreshCw, Archive, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <div className="space-y-6">
      {/* Forçar atualização */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 shrink-0">
            <RefreshCw className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Forçar atualização
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Limpa cache, desregistra o service worker e recarrega a página. Use
              quando o tablet ficar travado em uma versão antiga.
            </p>
          </div>
        </div>
        <Button
          onClick={handleForceUpdate}
          className="w-full h-11 gap-2 font-medium"
          variant="destructive"
        >
          <RefreshCw className="w-4 h-4" /> Forçar atualização
        </Button>
        <p className="text-xs text-muted-foreground text-center font-mono">
          Versão atual: {getAppVersion()}
        </p>
      </Card>

      {/* Arquivar pedidos */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 shrink-0">
            <Archive className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Arquivar pedidos antigos
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
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
          className="w-full h-11 gap-2 font-medium"
        >
          <Archive className="w-4 h-4" />
          {archiving ? "Arquivando…" : "Arquivar agora"}
        </Button>
      </Card>

      {/* Histórico */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 shrink-0">
            <History className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Histórico de arquivamentos
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Últimas 20 execuções (manual ou automática às 04:00).
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={loadLogs}
            disabled={loadingLogs}
            className="h-8 w-8 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loadingLogs ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
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
                  className="rounded-lg border border-border bg-muted/30 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          ok ? "bg-success" : "bg-destructive"
                        }`}
                      />
                      <span className="font-medium text-foreground truncate tabular-nums">
                        {new Date(log.executed_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-background border border-border text-muted-foreground shrink-0">
                      {log.trigger_source}
                    </span>
                  </div>
                  {ok ? (
                    <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-2 gap-y-0.5">
                      <span>Pedidos: <span className="font-semibold text-foreground tabular-nums">{String(r.deleted_orders ?? 0)}</span></span>
                      <span>Itens: <span className="font-semibold text-foreground tabular-nums">{String(r.deleted_order_items ?? 0)}</span></span>
                      <span>Dias resumo: <span className="font-semibold text-foreground tabular-nums">{String(r.archived_summary_days ?? 0)}</span></span>
                      <span>Garçons: <span className="font-semibold text-foreground tabular-nums">{String(r.archived_waiter_rows ?? 0)}</span></span>
                      <span>Produtos: <span className="font-semibold text-foreground tabular-nums">{String(r.archived_product_rows ?? 0)}</span></span>
                      <span>Mov. estoque: <span className="font-semibold text-foreground tabular-nums">{String(r.deleted_inventory_movements ?? 0)}</span></span>
                    </div>
                  ) : (
                    <p className="text-xs text-destructive font-mono break-all">
                      {log.error_message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2 tabular-nums">
                    {log.days_kept} dias mantidos · {log.duration_ms ?? 0}ms
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default SystemTab;
