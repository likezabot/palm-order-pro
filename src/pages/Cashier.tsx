import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Printer, Pencil, CheckCircle2, Users, Package, Clock, ChevronRight, AlertTriangle, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Order } from "@/lib/types";
import CloseOrder from "@/components/cashier/CloseOrder";
import PrintChoiceDialog, { type PrintChoice } from "@/components/cashier/PrintChoiceDialog";
import { manualPrintOrder, manualPrintBill, manualPrintDelta, type ManualPrintResult } from "@/lib/print-service";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";
import { formatTableLabel } from "@/lib/utils";
import { useElapsedTime } from "@/hooks/use-elapsed-time";

const STATUS_LABEL: Record<string, string> = {
  new: "AGUARDANDO",
  preparing: "EM PREPARO",
  done: "PRONTO",
};

const STATUS_VERB: Record<string, string> = {
  new: "aguardando",
  preparing: "em preparo",
  done: "pronto",
};

const ADVANCE_LABEL: Record<string, string> = {
  new: "▶ PREPARAR",
  preparing: "✅ PRONTO",
};

const ADVANCE_BTN: Record<string, string> = {
  new: "bg-warning text-warning-foreground",
  preparing: "bg-success text-success-foreground",
};

const STATUS_CHIP: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  preparing: "bg-warning/15 text-warning border-warning/30",
  done: "bg-success/15 text-success border-success/30",
};

const NEXT_STATUS: Record<string, string | null> = {
  new: "preparing",
  preparing: "done",
  done: null,
};

interface OrderCardProps {
  order: Order;
  itemCount: number;
  onPrint: (o: Order) => void;
  onEdit: (o: Order) => void;
  onAdvance: (o: Order) => void;
  onClose: (o: Order) => void;
}

const OrderCard = ({ order, itemCount, onPrint, onEdit, onAdvance, onClose }: OrderCardProps) => {
  // Tempo NA ETAPA atual
  const elapsed = useElapsedTime(order.updated_at || order.created_at);
  const wasPrinted = order.print_status === "printed";
  const printFailed = order.print_status === "failed";
  const isPending = order.print_status === "pending" || order.print_status === "printing";
  const status = order.status || "new";
  const next = NEXT_STATUS[status];

  // Borda de urgência baseada em tempo na etapa
  const stageMin = Math.floor((Date.now() - new Date(order.updated_at || order.created_at).getTime()) / 60000);
  const isCritical = stageMin >= 25;
  const isAlert = !isCritical && stageMin >= 10;

  const accentBorder = status === "done"
    ? "border-l-4 border-l-success"
    : isCritical
      ? "border-l-4 border-l-destructive"
      : isAlert
        ? "border-l-4 border-l-warning"
        : printFailed
          ? "border-l-4 border-l-destructive"
          : "border-l-4 border-l-transparent";

  // Texto do tempo padronizado
  const getTimeLabel = () => {
    if (!elapsed || elapsed === "agora") return "agora";
    const statusText = status === "new" ? "Aguardando" : status === "preparing" ? "Em preparo" : "Pronto";
    return `${statusText} há ${elapsed}`;
  };

  return (
    <div
      className={`relative flex flex-col p-3 rounded-xl bg-card border-2 border-border ${accentBorder} shadow-sm hover:border-primary/40 hover:shadow-md transition-all cursor-pointer min-h-[160px]`}
      onClick={() => onClose(order)}
    >
      {/* Header: Mesa + Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-black text-xl text-foreground leading-tight break-words">
            {formatTableLabel(order.table_name, order.original_table_name)}
          </p>
          {order.original_table_name && order.table_name !== order.original_table_name && order.table_name !== "BALCÃO" && (
            <p className="text-[10px] font-bold text-muted-foreground mt-0.5">(Mesa {order.original_table_name})</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${STATUS_CHIP[status] || STATUS_CHIP.new}`}>
            {STATUS_LABEL[status] || status.toUpperCase()}
          </span>
          {wasPrinted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/20 px-1.5 py-0.5 text-[9px] font-bold uppercase">
              <CheckCircle2 className="w-2.5 h-2.5" /> Impresso
            </span>
          )}
          {printFailed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 text-[9px] font-bold uppercase">
              <AlertTriangle className="w-2.5 h-2.5" /> Falha
            </span>
          )}
          {isPending && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border px-1.5 py-0.5 text-[9px] font-bold uppercase">
              Aguardando
            </span>
          )}
        </div>
      </div>

      {/* Info central compacta */}
      <div className="flex-1 flex flex-col justify-center gap-1 py-1">
        {order.waiter_name && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate font-medium text-foreground/80">{order.waiter_name}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="w-3.5 h-3.5 shrink-0" />
          <span>{itemCount} {itemCount === 1 ? "item" : "itens"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium text-foreground">{getTimeLabel()}</span>
        </div>
      </div>

      {/* Base: ações */}
      <div className="flex items-center gap-1 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onPrint(order)}
          className="p-2 rounded-lg bg-secondary text-foreground active:scale-95 transition-transform shrink-0 hover:bg-secondary/80"
          title="Imprimir"
          aria-label="Imprimir"
        >
          <Printer size={16} />
        </button>
        <button
          onClick={() => onEdit(order)}
          className="p-2 rounded-lg bg-secondary text-foreground active:scale-95 transition-transform shrink-0 hover:bg-secondary/80"
          title="Editar"
          aria-label="Editar"
        >
          <Pencil size={16} />
        </button>
        {next ? (
          <button
            onClick={() => onAdvance(order)}
            className={`flex-1 rounded-lg px-3 py-2 font-black text-xs tracking-wide active:scale-95 transition-transform min-h-[36px] ${ADVANCE_BTN[status] || "bg-secondary text-foreground"}`}
            title={`Avançar para ${STATUS_LABEL[next]}`}
            aria-label="Avançar status"
          >
            {ADVANCE_LABEL[status] || <ChevronRight size={16} />}
          </button>
        ) : (
          <button
            onClick={() => onClose(order)}
            className="flex-1 rounded-lg bg-gradient-to-r from-primary to-primary/80 px-3 py-2 font-black text-xs tracking-wide text-primary-foreground active:scale-95 transition-transform min-h-[36px]"
          >
            <DollarSign size={14} className="inline mr-1" /> FECHAR
          </button>
        )}
      </div>
    </div>
  );
};

const Cashier = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playFeedback } = useFeedback();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);

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

  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);

  const { data: itemCountMap = new Map<string, number>() } = useQuery({
    queryKey: ["cashier-item-counts", orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return new Map<string, number>();
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, quantity")
        .in("order_id", orderIds);
      if (error) throw error;
      const map = new Map<string, number>();
      (data || []).forEach((r: { order_id: string; quantity: number }) => {
        map.set(r.order_id, (map.get(r.order_id) || 0) + (r.quantity || 0));
      });
      return map;
    },
    enabled: orderIds.length > 0,
    refetchInterval: 5000,
  });

  const handlePrint = (order: Order) => {
    playFeedback("click");
    setPrintOrder(order);
  };

  const handlePrintChoice = async (choice: PrintChoice) => {
    const order = printOrder;
    setPrintOrder(null);
    if (!order) return;

    const label = formatTableLabel(order.table_name, order.original_table_name);
    let result: ManualPrintResult;
    try {
      if (choice === "full") result = await manualPrintOrder(order);
      else if (choice === "bill") result = await manualPrintBill(order);
      else result = await manualPrintDelta(order);
    } catch (err) {
      console.error(err);
      playFeedback("error");
      toast({ title: "Erro inesperado ao imprimir", variant: "destructive" });
      return;
    }

    if (result.ok && result.bridgeOk) {
      playFeedback("success");
      toast({
        title: `Cupom enviado para ${label}`,
        description: result.queued ? "Também encaminhado à central." : undefined,
      });
    } else if (result.ok && result.queued) {
      playFeedback("success");
      toast({
        title: "Enviado à central de impressão",
        description: `Impressora local indisponível — ${label} entrou na fila.`,
      });
    } else if (result.reason === "no_items") {
      playFeedback("error");
      toast({ title: "Mesa sem itens cadastrados", variant: "destructive" });
    } else if (result.reason === "no_delta") {
      playFeedback("error");
      toast({ title: "Nenhum acréscimo recente para reimprimir", variant: "destructive" });
    } else {
      playFeedback("error");
      toast({ title: "Falha ao imprimir", description: "Sem bridge local nem central configurada.", variant: "destructive" });
    }
  };

  const handleEdit = (order: Order) => {
    playFeedback("click");
    navigate(`/palm?orderId=${order.id}&tableName=${order.table_name}`);
  };

  const handleAdvance = async (order: Order) => {
    playFeedback("click");
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    const { error } = await supabase.rpc("update_order_status", {
      p_order_id: order.id,
      p_status: next,
    });
    if (error) {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Status: ${STATUS_LABEL[next]}` });
    queryClient.invalidateQueries({ queryKey: ["cashier-orders"] });
  };

  const handleOpenClose = (order: Order) => {
    playFeedback("click");
    setSelectedOrder(order);
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
        <span className="ml-auto text-xs text-muted-foreground font-semibold">
          {orders.length} {orders.length === 1 ? "mesa aberta" : "mesas abertas"}
        </span>
      </div>

      <div className="flex-1 p-3 sm:p-4">
        {orders.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Nenhuma mesa aberta</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-fr">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                itemCount={itemCountMap.get(order.id) || 0}
                onPrint={handlePrint}
                onEdit={handleEdit}
                onAdvance={handleAdvance}
                onClose={handleOpenClose}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Cashier;
