import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeedback } from "@/hooks/use-feedback";
import { UserCircle, RefreshCw, Loader2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

interface TableGridProps {
  onSelectTable: (tableName: string) => void;
  waiterName: string;
  onSetWaiter: (name: string) => void;
}

const TABLES = ["BALCÃO", ...Array.from({ length: 20 }, (_, i) => (i + 1).toString())];

export const TableGrid = ({ onSelectTable, waiterName, onSetWaiter }: TableGridProps) => {
  const navigate = useNavigate();
  const { playFeedback } = useFeedback();
  const queryClient = useQueryClient();
  const [editingWaiter, setEditingWaiter] = useState(!waiterName);
  const [tempWaiterName, setTempWaiterName] = useState(waiterName);

  const { data: activeOrders, isLoading } = useQuery({
    queryKey: ["active-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("table_name, status, total, waiter_name")
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

  const handleTableClick = (tableName: string) => {
    playFeedback("click");
    onSelectTable(tableName);
  };

  const handleSaveWaiter = () => {
    if (tempWaiterName.trim()) {
      onSetWaiter(tempWaiterName.trim());
      setEditingWaiter(false);
      playFeedback("success");
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
      {/* Header / Waiter Info */}
      <div className="flex items-center justify-between mb-6">
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

      <h2 className="text-xl font-bold mb-4 px-1">MESAS</h2>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {TABLES.map((table) => {
            const order = activeOrders?.find((o) => o.table_name === table);
            const isOccupied = !!order;
            const isWaitingPayment = order?.status === "done";
            
            let statusColor = "bg-emerald-500/10 border-emerald-500/50 text-emerald-500";
            let pulseClass = "";

            if (isWaitingPayment) {
              statusColor = "bg-amber-500/20 border-amber-500 text-amber-500";
              pulseClass = "animate-pulse-active ring-2 ring-amber-500/50";
            } else if (isOccupied) {
              statusColor = "bg-red-500/20 border-red-500 text-red-500";
              pulseClass = "animate-pulse-active ring-2 ring-red-500/50";
            }

            return (
              <button
                key={table}
                onClick={() => handleTableClick(table)}
                className={`
                  relative aspect-square flex flex-col items-center justify-center rounded-2xl border-2 transition-all active:scale-95
                  ${statusColor} ${pulseClass}
                  ${!isOccupied ? 'hover:bg-emerald-500/20 border-dashed' : 'border-solid shadow-lg'}
                `}
              >
                <span className="text-2xl font-black">{table}</span>
                {isOccupied && (
                  <div className="mt-1 flex flex-col items-center">
                    <span className="text-[10px] font-bold opacity-80 uppercase truncate w-full text-center px-1">
                      {order.waiter_name || "---"}
                    </span>
                    <span className="text-xs font-bold">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(order.total)}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TableGrid;
