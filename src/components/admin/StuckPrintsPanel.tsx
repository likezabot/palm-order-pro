/**
 * Painel de pedidos travados em impressão — Plano B Espetaria
 *
 * Mostra pedidos com print_status='printing' há mais de 30s ou 'queued' parado.
 * Permite ao operador forçar reimpressão imediata via manualPrintOrder.
 */
import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, RefreshCw, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { manualPrintOrder } from "@/lib/print-service";

type StuckOrder = {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number | null;
  print_status: string;
  print_claimed_at: string | null;
  print_last_error: string | null;
  updated_at: string;
  original_table_name: string | null;
};

export function StuckPrintsPanel() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<StuckOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, table_name, waiter_name, total, print_status, print_claimed_at, print_last_error, updated_at, original_table_name",
        )
        .in("print_status", ["printing", "queued", "pending"])
        .in("status", ["new", "preparing", "done", "paid"])
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const now = Date.now();
      // só mostra realmente "travado": printing há >30s, queued há >60s, pending há >60s
      const stuck = (data ?? []).filter((o: any) => {
        const age = now - new Date(o.updated_at).getTime();
        if (o.print_status === "printing") return age > 30_000;
        return age > 60_000;
      });
      setOrders(stuck as StuckOrder[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  const retry = async (o: StuckOrder) => {
    setRetrying(o.id);
    try {
      const r = await manualPrintOrder(o);
      toast({
        title: r.ok ? "Reimpressão disparada" : "Falha ao reimprimir",
        description: r.bridgeOk
          ? "Bridge local respondeu OK."
          : r.queued
            ? "Enfileirado — vai sair quando a bridge voltar."
            : "Bridge offline e fila falhou. Veja o diagnóstico em Impressão.",
        variant: r.ok ? "default" : "destructive",
      });
      await load();
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50/50 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-100 p-2.5">
          <AlertTriangle className="w-5 h-5 text-amber-700" />
        </div>
        <div className="flex-1">
          <h3 className="font-black text-lg text-amber-900">
            Pedidos travados em impressão
          </h3>
          <p className="text-sm text-amber-800/80 mt-1">
            Pedidos que ficaram em <code>printing</code> há mais de 30s ou em{" "}
            <code>queued</code>/<code>pending</code> por mais de 1min. Use
            <strong> Reimprimir agora</strong> para destravar.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-amber-800/70 text-center py-4 italic">
          {loading ? "Verificando…" : "Nenhum pedido travado. ✓"}
        </p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => {
            const ageMs = Date.now() - new Date(o.updated_at).getTime();
            const ageS = Math.round(ageMs / 1000);
            return (
              <div
                key={o.id}
                className="rounded-lg border border-amber-200 bg-background p-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{o.table_name}</span>
                    <span className="text-xs px-2 py-0.5 rounded font-mono bg-amber-100 text-amber-900 border border-amber-200">
                      {o.print_status}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      há {ageS < 60 ? `${ageS}s` : `${Math.floor(ageS / 60)}m${ageS % 60}s`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {o.waiter_name ?? "—"} · R$ {(o.total ?? 0).toFixed(2)}
                    {o.print_last_error ? ` · ${o.print_last_error}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 font-bold"
                  onClick={() => retry(o)}
                  disabled={retrying !== null}
                >
                  <Printer className={`w-3.5 h-3.5 ${retrying === o.id ? "animate-pulse" : ""}`} />
                  REIMPRIMIR
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default StuckPrintsPanel;
