import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Printer, Pencil, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Order } from "@/lib/types";
import CloseOrder from "@/components/cashier/CloseOrder";
import { manualPrintOrder } from "@/lib/print-service";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";
import { formatTableLabel } from "@/lib/utils";

const Cashier = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playFeedback } = useFeedback();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ["cashier-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["new", "preparing", "done"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Order[];
    },
    refetchInterval: 5000,
  });

  const handlePrint = async (order: Order) => {
    playFeedback("click");
    const success = await manualPrintOrder(order);
    if (success) {
      toast({ title: `Cupom enviado para ${formatTableLabel(order.table_name, order.original_table_name)}` });
    } else {
      toast({ title: "Erro ao imprimir", variant: "destructive" });
    }
  };

  const handleEdit = (order: Order) => {
    playFeedback("click");
    navigate(`/palm?orderId=${order.id}&tableName=${order.table_name}`);
  };

  if (selectedOrder) {
    return (
      <CloseOrder
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onClosed={() => {
          setSelectedOrder(null);
          queryClient.invalidateQueries({ queryKey: ["cashier-orders"] });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen-safe flex flex-col">
      <div className="border-b border-border p-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-muted-foreground">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold uppercase tracking-tight">CAIXA</h1>
      </div>

      <div className="flex-1 p-4">
        {orders.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Nenhuma mesa aberta</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {orders.map((order) => {
              const wasPrinted = order.print_status === "printed";
              const printFailed = order.print_status === "failed";
              return (
                <div
                  key={order.id}
                  className="relative flex flex-col gap-3 rounded-xl bg-card border-2 border-border p-4 shadow-sm hover:border-primary/40 transition-colors"
                >
                  {/* Status chip top-right */}
                  {wasPrinted && (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-success/15 text-success border border-success/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
                      <CheckCircle2 className="w-3 h-3" /> FEITO
                    </span>
                  )}
                  {printFailed && (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive border border-destructive/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
                      ⚠ FALHA
                    </span>
                  )}

                  {/* Table name */}
                  <div className="pr-16">
                    <p className="font-black text-2xl text-foreground leading-tight break-words">
                      {formatTableLabel(order.table_name, order.original_table_name)}
                    </p>
                    {order.original_table_name && order.table_name !== order.original_table_name && order.table_name !== "BALCÃO" && (
                      <p className="text-xs font-bold text-muted-foreground mt-0.5">(Mesa {order.original_table_name})</p>
                    )}
                  </div>

                  {/* Total */}
                  <p className="text-primary font-black text-2xl">R$ {(order.total || 0).toFixed(2)}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-auto">
                    <button
                      onClick={() => handlePrint(order)}
                      className="p-3 rounded-lg bg-secondary text-foreground active:scale-95 transition-transform shrink-0"
                      title="Imprimir"
                      aria-label="Imprimir"
                    >
                      <Printer size={20} />
                    </button>
                    <button
                      onClick={() => handleEdit(order)}
                      className="p-3 rounded-lg bg-secondary text-foreground active:scale-95 transition-transform shrink-0"
                      title="Editar"
                      aria-label="Editar"
                    >
                      <Pencil size={20} />
                    </button>
                    <button
                      onClick={() => {
                        playFeedback("click");
                        setSelectedOrder(order);
                      }}
                      className="flex-1 rounded-lg bg-primary px-4 py-3 font-black text-primary-foreground active:scale-95 transition-transform min-h-[48px]"
                    >
                      FECHAR
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Cashier;
