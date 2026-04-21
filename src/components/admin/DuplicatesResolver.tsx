import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Layers, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";

interface OrderRow {
  id: string;
  table_name: string;
  original_table_name: string | null;
  status: string;
  total: number | null;
  waiter_name: string | null;
  created_at: string;
}

interface DuplicateGroup {
  physicalTable: string;
  orders: OrderRow[];
}

const DuplicatesResolver = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playFeedback } = useFeedback();
  const [open, setOpen] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);

  const { data: activeOrders = [] } = useQuery({
    queryKey: ["admin-active-orders-duplicates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, table_name, original_table_name, status, total, waiter_name, created_at")
        .in("status", ["new", "preparing", "done"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
    refetchInterval: 20_000,
  });

  const duplicateGroups: DuplicateGroup[] = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const o of activeOrders) {
      const key = (o.original_table_name ?? o.table_name) || "";
      if (!key || key === "BALCÃO") continue;
      const arr = map.get(key) ?? [];
      arr.push(o);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .filter(([, list]) => list.length > 1)
      .map(([physicalTable, orders]) => ({ physicalTable, orders }))
      .sort((a, b) => a.physicalTable.localeCompare(b.physicalTable, "pt-BR", { numeric: true }));
  }, [activeOrders]);

  const totalDuplicates = duplicateGroups.length;

  const handleMerge = async (group: DuplicateGroup) => {
    const ok = window.confirm(
      `Mesclar ${group.orders.length} pedidos da Mesa ${group.physicalTable} em um só?\n\n` +
        `Os itens serão somados e os pedidos extras serão removidos. Esta ação não pode ser desfeita.`
    );
    if (!ok) return;

    setMerging(group.physicalTable);
    const { data, error } = await supabase.rpc("merge_table_duplicates", {
      p_table_name: group.physicalTable,
    });
    setMerging(null);

    if (error) {
      playFeedback("error");
      toast({
        title: "Erro ao mesclar",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    playFeedback("success");
    const merged = (data as any)?.merged ?? 0;
    toast({
      title: `Mesa ${group.physicalTable} mesclada`,
      description: `${merged} pedido(s) extra(s) removido(s) e itens consolidados.`,
    });
    queryClient.invalidateQueries({ queryKey: ["admin-active-orders-duplicates"] });
    queryClient.invalidateQueries({ queryKey: ["admin-active-orders"] });
    queryClient.invalidateQueries({ queryKey: ["active-orders"] });
  };

  const handleMergeAll = async () => {
    const ok = window.confirm(
      `Mesclar TODAS as ${totalDuplicates} mesas com duplicatas? Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    for (const g of duplicateGroups) {
      setMerging(g.physicalTable);
      const { error } = await supabase.rpc("merge_table_duplicates", {
        p_table_name: g.physicalTable,
      });
      if (error) {
        toast({
          title: `Erro na Mesa ${g.physicalTable}`,
          description: error.message,
          variant: "destructive",
        });
      }
    }
    setMerging(null);
    playFeedback("success");
    toast({ title: "Mesclagem concluída" });
    queryClient.invalidateQueries({ queryKey: ["admin-active-orders-duplicates"] });
    queryClient.invalidateQueries({ queryKey: ["admin-active-orders"] });
    queryClient.invalidateQueries({ queryKey: ["active-orders"] });
  };

  if (totalDuplicates === 0) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Nenhuma duplicata encontrada"
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider bg-secondary text-muted-foreground hover:text-foreground transition-colors"
      >
        <Layers size={14} />
        Duplicatas
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider bg-yellow-500/15 text-yellow-600 border border-yellow-500/40 hover:bg-yellow-500/25 transition-colors animate-pulse"
      >
        <AlertTriangle size={14} />
        {totalDuplicates} Duplicata{totalDuplicates > 1 ? "s" : ""}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Resolver Duplicatas de Mesa
            </DialogTitle>
            <DialogDescription>
              {totalDuplicates === 0
                ? "Nenhuma duplicata encontrada. ✅"
                : `Encontramos ${totalDuplicates} mesa(s) com mais de um pedido ativo. Mesclar irá somar os itens em um único pedido (mantendo o mais antigo).`}
            </DialogDescription>
          </DialogHeader>

          {totalDuplicates > 1 && (
            <Button
              onClick={handleMergeAll}
              disabled={!!merging}
              variant="default"
              className="w-full font-bold gap-2"
            >
              {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              Mesclar todas ({totalDuplicates})
            </Button>
          )}

          <div className="space-y-3">
            {duplicateGroups.map((g) => (
              <div
                key={g.physicalTable}
                className="rounded-xl border-2 border-yellow-500/40 bg-yellow-500/5 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-black flex items-center gap-2">
                    <AlertTriangle size={16} className="text-yellow-500" />
                    Mesa {g.physicalTable}
                    <span className="text-xs font-bold text-muted-foreground">
                      ({g.orders.length} pedidos)
                    </span>
                  </h3>
                  <Button
                    onClick={() => handleMerge(g)}
                    disabled={!!merging}
                    size="sm"
                    className="font-bold gap-1.5"
                  >
                    {merging === g.physicalTable ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Layers className="w-3.5 h-3.5" />
                    )}
                    Mesclar
                  </Button>
                </div>

                <div className="space-y-1.5">
                  {g.orders.map((o, idx) => (
                    <div
                      key={o.id}
                      className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
                        idx === 0
                          ? "bg-emerald-500/10 border border-emerald-500/30"
                          : "bg-card border border-border"
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold truncate">
                          {o.table_name}
                          {idx === 0 && (
                            <span className="ml-2 text-[10px] font-black uppercase text-emerald-600">
                              principal
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {o.waiter_name || "—"} ·{" "}
                          {new Date(o.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <span className="text-sm font-black tabular-nums shrink-0">
                        R$ {(o.total ?? 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {totalDuplicates === 0 && (
              <p className="text-center py-6 text-sm text-muted-foreground">
                Tudo limpo! Nenhuma duplicata ativa.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DuplicatesResolver;
