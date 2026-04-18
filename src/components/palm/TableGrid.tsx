import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeedback } from "@/hooks/use-feedback";
import { UserCircle, RefreshCw, Loader2, ArrowLeft, Plus, Store, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

interface TableGridProps {
  onSelectTable: (tableName: string, existingOrderId?: string) => void;
  waiterName: string;
  onSetWaiter: (name: string) => void;
}

export const TableGrid = ({ onSelectTable, waiterName, onSetWaiter }: TableGridProps) => {
  const navigate = useNavigate();
  const { playFeedback } = useFeedback();
  const queryClient = useQueryClient();
  const [editingWaiter, setEditingWaiter] = useState(!waiterName);
  const [tempWaiterName, setTempWaiterName] = useState(waiterName);

  const { data: tableCount = 10 } = useQuery({
    queryKey: ["table-count"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("value").eq("key", "table_count").single();
      return data ? Number(data.value) : 10;
    },
    staleTime: 30000,
  });

  const TABLES = Array.from({ length: tableCount }, (_, i) => (i + 1).toString());

  const { data: activeOrders, isLoading } = useQuery({
    queryKey: ["active-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, table_name, original_table_name, status, total, waiter_name, created_at, order_items(quantity)")
        .in("status", ["new", "preparing", "done"]);

      if (error) throw error;
      // Soma quantidades dos itens em cada pedido
      return (data ?? []).map((o: any) => ({
        ...o,
        item_count: (o.order_items ?? []).reduce(
          (sum: number, it: { quantity: number }) => sum + (it.quantity ?? 0),
          0
        ),
      }));
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("orders-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["active-orders"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const balcaoOrders = (activeOrders?.filter((o) => o.table_name === "BALCÃO") || [])
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const getSenha = (order: typeof balcaoOrders[0]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allTodayBalcao = (activeOrders || [])
      .filter((o) => o.table_name === "BALCÃO" && new Date(o.created_at) >= today)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const idx = allTodayBalcao.findIndex((o) => o.id === order.id);
    return `#${(idx + 1).toString().padStart(3, "0")}`;
  };

  const handleTableClick = (tableName: string, orderId?: string) => {
    playFeedback("click");
    onSelectTable(tableName, orderId);
  };

  const handleNewBalcao = () => {
    playFeedback("click");
    onSelectTable("BALCÃO");
  };

  const handleSaveWaiter = () => {
    if (tempWaiterName.trim()) {
      onSetWaiter(tempWaiterName.trim());
      setEditingWaiter(false);
      playFeedback("success");
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const elapsed = (dateStr: string) => {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
    if (diffSec < 60) return "agora";
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`;
  };

  // Tick a cada 30s para atualizar tempo decorrido
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const formatCurrency = (value: number | null) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return { label: "Novo", cls: "bg-blue-500/20 text-blue-400" };
      case "preparing":
        return { label: "Preparo", cls: "bg-red-500/20 text-red-400" };
      case "done":
        return { label: "Pronto", cls: "bg-amber-500/20 text-amber-400" };
      default:
        return { label: status, cls: "bg-muted text-muted-foreground" };
    }
  };

  if (editingWaiter) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-primary mb-2">BEM-VINDO</h1>
            <p className="text-muted-foreground">Identifique-se para começar</p>
          </div>
          
          <input
            type="text"
            placeholder="Seu Nome (Garçom)"
            value={tempWaiterName}
            onChange={(e) => setTempWaiterName(e.target.value)}
            className="w-full rounded-xl border-2 border-border bg-card p-4 text-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSaveWaiter()}
          />
          
          <button
            onClick={handleSaveWaiter}
            disabled={!tempWaiterName.trim()}
            className="w-full rounded-xl bg-primary p-4 text-lg font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
          >
            ENTRAR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => {
            playFeedback("click");
            navigate("/");
          }}
          className="flex items-center gap-2 text-muted-foreground"
        >
          <ArrowLeft size={20} />
          <span className="font-medium">Início</span>
        </button>

        <div className="flex items-center gap-3 bg-card border border-border rounded-full pl-3 pr-1 py-1">
          <div className="flex items-center gap-2">
            <UserCircle size={18} className="text-primary" />
            <span className="text-xs font-bold text-foreground truncate max-w-[80px]">
              {waiterName}
            </span>
          </div>
          <button
            onClick={() => {
              playFeedback("click");
              setEditingWaiter(true);
            }}
            className="p-1.5 rounded-full hover:bg-secondary transition-colors"
          >
            <RefreshCw size={14} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : (
        <>
          {/* ── BALCÃO Section ── */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Store size={18} className="text-primary" />
              <h2 className="text-lg font-bold">BALCÃO</h2>
            </div>

            <button
              onClick={handleNewBalcao}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/50 bg-primary/10 p-4 text-primary font-bold transition-all active:scale-[0.98] hover:bg-primary/20 mb-3"
            >
              <Plus size={20} />
              NOVO PEDIDO
            </button>

            {balcaoOrders.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                {balcaoOrders.map((order) => {
                  const badge = getStatusBadge(order.status);
                  return (
                    <button
                      key={order.id}
                      onClick={() => handleTableClick("BALCÃO", order.id)}
                      className="flex-shrink-0 flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-3 min-w-[100px] transition-all active:scale-95 hover:border-primary/50"
                    >
                      <span className="text-lg font-black text-primary">{getSenha(order)}</span>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock size={12} />
                        <span className="text-xs font-bold">{formatTime(order.created_at)}</span>
                      </div>
                      <span className="text-sm font-black text-foreground">
                        {formatCurrency(order.total)}
                      </span>
                      {(order as any).item_count > 0 && (
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {(order as any).item_count} {(order as any).item_count === 1 ? "item" : "itens"}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {order.waiter_name && (
                        <span className="text-[10px] text-muted-foreground truncate w-full">
                          {order.waiter_name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── MESAS Section ── */}
          <h2 className="text-lg font-bold mb-3 px-1">MESAS</h2>

          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {TABLES.map((table) => {
              // Casar pelo número físico (original_table_name) — assim mesas
              // renomeadas para "João" continuam ligadas ao botão "1".
              // Fallback: pedidos antigos sem original_table_name caem em table_name.
              const order = activeOrders?.find(
                (o) => (o.original_table_name ?? o.table_name) === table
              );
              const isOccupied = !!order;
              const isWaitingPayment = order?.status === "done";
              const customName =
                order && order.table_name !== (order.original_table_name ?? table)
                  ? order.table_name
                  : null;
              
              let statusColor = "bg-emerald-500/20 border-emerald-500 text-emerald-500";
              let pulseClass = "";
              let pulseColor = "";

              if (isWaitingPayment) {
                statusColor = "bg-amber-500/20 border-amber-500 text-amber-500";
                pulseClass = "animate-pulse-active ring-2 ring-amber-500/50";
                pulseColor = "rgba(245, 158, 11, 0.4)";
              } else if (isOccupied) {
                statusColor = "bg-red-500/20 border-red-500 text-red-500";
                pulseClass = "animate-pulse-active ring-2 ring-red-500/50";
                pulseColor = "rgba(239, 68, 68, 0.4)";
              }

              return (
                <button
                  key={table}
                  onClick={() => handleTableClick(table, order?.id)}
                  style={{ "--pulse-color": pulseColor } as any}
                  className={`
                    relative aspect-square flex flex-col items-center justify-center rounded-2xl border-[3px] transition-all active:scale-95
                    ${statusColor} ${pulseClass}
                    ${!isOccupied ? 'hover:bg-emerald-500/30' : 'border-solid shadow-lg'}
                  `}
                >
                  {customName ? (
                    <span className="text-base font-black leading-tight truncate w-full text-center px-1">
                      {customName}
                    </span>
                  ) : (
                    <span className="text-2xl font-black leading-none">{table}</span>
                  )}
                  {isOccupied && (
                    <div className="mt-1 flex flex-col items-center leading-tight">
                      <span className="text-[10px] font-bold opacity-80 uppercase truncate w-full text-center px-1">
                        {order.waiter_name || "---"}
                      </span>
                      <span className="text-xs font-bold">
                        {formatCurrency(order.total)}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold opacity-90">
                        <Clock size={10} />
                        {formatTime(order.created_at)} · {elapsed(order.created_at)}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default TableGrid;
