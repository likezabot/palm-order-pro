import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeedback } from "@/hooks/use-feedback";
import { UserCircle, RefreshCw, Loader2, ArrowLeft, Plus, Store, Clock, Hash, Delete } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TableGridProps {
  onSelectTable: (tableName: string, existingOrderId?: string) => void;
  waiterName: string;
  onSetWaiter: (name: string) => void;
}

export const TableGrid = ({ onSelectTable, waiterName, onSetWaiter }: TableGridProps) => {
  const navigate = useNavigate();
  const { playFeedback } = useFeedback();
  const queryClient = useQueryClient();
  
  const [showManualTable, setShowManualTable] = useState(false);
  const [manualTable, setManualTable] = useState("");

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
        .select("id, table_name, status, total, waiter_name, created_at")
        .in("status", ["new", "preparing", "done"]);
      
      if (error) throw error;
      return data;
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

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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

  const handleNumpadPress = (num: string) => {
    playFeedback("click");
    // SOLUÇÃO OBRIGATÓRIA: Usar callback para append
    setManualTable(prev => prev + num);
  };

  const handleManualConfirm = () => {
    if (!manualTable) return;
    const existingOrder = activeOrders?.find(o => o.table_name === manualTable);
    onSelectTable(manualTable, existingOrder?.id);
    setManualTable("");
    setShowManualTable(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#1a1a1a] p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => {
            playFeedback("click");
            navigate("/");
          }}
          className="flex items-center gap-2 text-white/40 font-bold uppercase text-xs tracking-widest"
        >
          <ArrowLeft size={20} />
          <span>Sair</span>
        </button>

        <div className="flex items-center gap-3 bg-[#2a2a2a] border border-white/5 rounded-full pl-3 pr-4 py-2">
          <UserCircle size={18} className="text-primary" />
          <span className="text-xs font-black text-white uppercase tracking-tight truncate max-w-[120px]">
            {waiterName}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-6">
            <button
              onClick={handleNewBalcao}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary/10 border-2 border-dashed border-primary/30 p-5 text-primary font-black uppercase tracking-widest text-sm transition-all active:scale-[0.98]"
            >
              <Store size={20} />
              BALCÃO
            </button>
            <button
              onClick={() => setShowManualTable(true)}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-white/5 border-2 border-dashed border-white/10 p-5 text-white/60 font-black uppercase tracking-widest text-sm transition-all active:scale-[0.98]"
            >
              <Hash size={20} />
              DIGITAR MESA
            </button>
          </div>

          {balcaoOrders.length > 0 && (
            <div className="mb-6">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {balcaoOrders.map((order) => {
                  const badge = getStatusBadge(order.status);
                  return (
                    <button
                      key={order.id}
                      onClick={() => handleTableClick("BALCÃO", order.id)}
                      className="flex-shrink-0 flex flex-col items-start gap-1 rounded-xl border border-white/5 bg-[#2a2a2a] p-4 min-w-[120px] transition-all active:scale-95 hover:border-primary/50 shadow-lg"
                    >
                      <span className="text-xl font-black text-primary">{getSenha(order)}</span>
                      <div className="flex items-center gap-1 text-white/40">
                        <Clock size={12} />
                        <span className="text-[10px] font-bold">{formatTime(order.created_at)}</span>
                      </div>
                      <span className="text-sm font-black text-white">
                        {formatCurrency(order.total)}
                      </span>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full mt-1 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <h2 className="text-xs font-black text-white/40 uppercase tracking-[0.2em] mb-4 px-1">Selecione a Mesa</h2>

          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {TABLES.map((table) => {
              const order = activeOrders?.find((o) => o.table_name === table);
              const isOccupied = !!order;
              const isWaitingPayment = order?.status === "done";
              
              let statusColor = "bg-[#2a2a2a] border-white/5 text-white/40";
              let pulseClass = "";

              if (isWaitingPayment) {
                statusColor = "bg-amber-500/10 border-amber-500 text-amber-500";
                pulseClass = "animate-pulse ring-1 ring-amber-500/30";
              } else if (isOccupied) {
                statusColor = "bg-primary/10 border-primary text-primary";
                pulseClass = "ring-1 ring-primary/30";
              }

              return (
                <button
                  key={table}
                  onClick={() => handleTableClick(table)}
                  className={`
                    relative aspect-square flex flex-col items-center justify-center rounded-2xl border-2 transition-all active:scale-95
                    ${statusColor} ${pulseClass}
                    ${!isOccupied ? 'hover:bg-white/5' : 'shadow-xl'}
                  `}
                >
                  <span className="text-2xl font-black">{table}</span>
                  {isOccupied && (
                    <div className="mt-1 flex flex-col items-center">
                      <span className="text-[9px] font-black opacity-60 uppercase truncate w-full text-center px-1">
                        {order.waiter_name || "---"}
                      </span>
                      <span className="text-[10px] font-black">
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Manual Table Numpad Dialog */}
      <Dialog open={showManualTable} onOpenChange={setShowManualTable}>
        <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-sm p-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-center uppercase tracking-tight text-primary">Número da Mesa</DialogTitle>
            <DialogDescription className="text-center text-white/40 font-bold uppercase tracking-widest text-xs">
              Digite o número para identificar o pedido
            </DialogDescription>
          </DialogHeader>

          <div className="py-6">
            <div className="h-20 w-full bg-[#2a2a2a] rounded-2xl border-2 border-white/5 flex items-center justify-center text-4xl font-black text-white mb-8">
              {manualTable || <span className="text-white/10">00</span>}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handleNumpadPress(num.toString())}
                  className="aspect-square rounded-2xl bg-[#2a2a2a] text-2xl font-black text-white active:scale-90 transition-transform border border-white/5"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => setManualTable(prev => prev.slice(0, -1))}
                className="aspect-square flex items-center justify-center text-white/40 active:scale-90"
              >
                <Delete size={32} />
              </button>
              <button
                onClick={() => handleNumpadPress("0")}
                className="aspect-square rounded-2xl bg-[#2a2a2a] text-2xl font-black text-white active:scale-90 transition-transform border border-white/5"
              >
                0
              </button>
              <button
                onClick={handleManualConfirm}
                disabled={!manualTable}
                className="aspect-square rounded-2xl bg-primary text-primary-foreground font-black active:scale-90 transition-transform flex items-center justify-center disabled:opacity-50"
              >
                OK
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TableGrid;

export default TableGrid;
