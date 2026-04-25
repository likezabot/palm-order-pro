import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Pencil, RefreshCw, Truck, Store, UtensilsCrossed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import OnlineOrderEditDialog from "./OnlineOrderEditDialog";

type OnlineOrder = {
  id: string;
  table_name: string;
  status: string;
  total: number | null;
  delivery_fee: number;
  service_type: string;
  created_at: string;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  payment_method: string | null;
};

const SERVICE_ICON: Record<string, typeof Truck> = {
  delivery: Truck,
  pickup: Store,
  dine_in: UtensilsCrossed,
};

const SERVICE_LABEL: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Retirada",
  dine_in: "No local",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Novo",
  preparing: "Em preparo",
  done: "Pronto",
  paid: "Finalizado",
  cancelled: "Cancelado",
};

const STATUS_BADGE: Record<string, string> = {
  new: "bg-primary/15 text-primary border-primary/30",
  preparing: "bg-warning/15 text-warning border-warning/30",
  done: "bg-success/15 text-success border-success/30",
  paid: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

async function fetchOnlineOrders(): Promise<OnlineOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, table_name, status, total, delivery_fee, service_type, created_at, customer_name_snapshot, customer_phone_snapshot, payment_method",
    )
    .eq("channel", "online")
    .in("status", ["new", "preparing", "done"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as OnlineOrder[];
}

export default function OnlineOrdersTab() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ["admin", "online-orders"],
    queryFn: fetchOnlineOrders,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  // Realtime: refetch ao mudar qualquer pedido online
  useEffect(() => {
    const ch = supabase
      .channel("admin-online-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => qc.invalidateQueries({ queryKey: ["admin", "online-orders"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const orders = ordersQuery.data ?? [];

  const grouped = useMemo(() => {
    const g: Record<string, OnlineOrder[]> = { new: [], preparing: [], done: [] };
    for (const o of orders) {
      if (g[o.status]) g[o.status].push(o);
    }
    return g;
  }, [orders]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black">Pedidos online</h2>
          <p className="text-sm text-muted-foreground">
            Pedidos vindos do cardápio público. Edite quantidade ou remova itens; o total é
            recalculado automaticamente (subtotal + taxa de entrega).
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => ordersQuery.refetch()}
          disabled={ordersQuery.isFetching}
          className="gap-2"
        >
          <RefreshCw size={14} className={ordersQuery.isFetching ? "animate-spin" : ""} />
          Atualizar
        </Button>
      </div>

      {ordersQuery.isLoading && (
        <div className="py-12 text-center text-muted-foreground">Carregando…</div>
      )}

      {!ordersQuery.isLoading && orders.length === 0 && (
        <div className="py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
          Nenhum pedido online ativo no momento.
        </div>
      )}

      {(["new", "preparing", "done"] as const).map((status) => {
        const list = grouped[status];
        if (!list?.length) return null;
        return (
          <section key={status} className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-muted-foreground">
              {STATUS_LABEL[status]} ({list.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((o) => {
                const Icon = SERVICE_ICON[o.service_type] ?? UtensilsCrossed;
                const subtotal = Math.max(
                  0,
                  Number(o.total ?? 0) - Number(o.delivery_fee ?? 0),
                );
                return (
                  <div
                    key={o.id}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black truncate">
                            {o.customer_name_snapshot || o.table_name}
                          </h4>
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase ${STATUS_BADGE[o.status] ?? ""}`}
                          >
                            {STATUS_LABEL[o.status] ?? o.status}
                          </Badge>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock size={12} />
                          {new Date(o.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {o.customer_phone_snapshot && (
                            <span className="truncate">• {o.customer_phone_snapshot}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-primary font-black text-lg tabular-nums">
                          R$ {Number(o.total ?? 0).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon size={14} />
                        {SERVICE_LABEL[o.service_type] ?? o.service_type}
                      </span>
                      {Number(o.delivery_fee) > 0 && (
                        <span className="tabular-nums">
                          Subtotal R$ {subtotal.toFixed(2)} + taxa R${" "}
                          {Number(o.delivery_fee).toFixed(2)}
                        </span>
                      )}
                    </div>

                    <Button
                      variant="default"
                      className="w-full gap-2 h-11 font-bold"
                      onClick={() => setEditingId(o.id)}
                    >
                      <Pencil size={16} /> Editar pedido
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <OnlineOrderEditDialog
        open={!!editingId}
        onOpenChange={(o) => !o && setEditingId(null)}
        orderId={editingId}
        onUpdated={() => qc.invalidateQueries({ queryKey: ["admin", "online-orders"] })}
      />
    </div>
  );
}
