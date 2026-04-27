import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Printer, DollarSign, AlertCircle, Banknote, CreditCard, QrCode, CheckCircle2, FilePlus, FileText, Receipt, User, Eye, EyeOff, Pencil, Bike, ShoppingBag, UtensilsCrossed, Wifi, MapPin, Phone, Wallet, Volume2, VolumeX, BellOff, Users, Split, X, Gift } from "lucide-react";
import { CancelOrderDialog } from "@/components/pdv/CancelOrderDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { Order, OrderItem } from "@/lib/types";
import { manualPrintOrder, manualPrintDelta, manualPrintBill } from "@/lib/print-service";
import { printCustomerReceipt } from "@/lib/print-receipt";
import { loadPrintConfig } from "@/lib/print-config";
import { enqueuePrintJob } from "@/lib/print-jobs";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/hooks/use-feedback";
import { formatTableLabel } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderRow } from "@/components/pdv/OrderRow";
import { PrintSettingsDialog } from "@/components/pdv/PrintSettingsDialog";
import { useSeenOrders } from "@/hooks/use-seen-orders";
import { useSiren } from "@/hooks/use-siren";
import { getOrderGroup, getOrderKind, isOnlineOrder, KIND_LABEL } from "@/lib/order-classification";

import { usePdvRealtime } from "@/hooks/use-pdv-realtime";
import { summarizeItemWaiters, formatWaiterTag } from "@/lib/order-items-group";
import { useConnectivity } from "@/hooks/use-connectivity";
import { checkBridgeStatus } from "@/lib/thermal-printer";

const statusConfig: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  new: { label: "AGUARDANDO", color: "bg-blue-500 text-white", next: "preparing", nextLabel: "▶ PREPARAR" },
  preparing: { label: "EM PREPARO", color: "bg-warning text-warning-foreground", next: "done", nextLabel: "✅ PRONTO" },
  done: { label: "PRONTO", color: "bg-success text-success-foreground" },
  paid: { label: "PAGO", color: "bg-muted text-muted-foreground" },
};

const Pdv = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playFeedback } = useFeedback();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [sending, setSending] = useState(false);
  const [wantCustomerData, setWantCustomerData] = useState(false);
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [pendingPrint, setPendingPrint] = useState<(() => Promise<void>) | null>(null);
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerDoc, setCustomerDoc] = useState("");
  const [staffMode, setStaffMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("pdv-staff-mode") === "1";
  });

  // Cancelamento de pedido
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  // Novos estados para dividir conta
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitCount, setSplitCount] = useState<number>(1);
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [paymentsHistory, setPaymentsHistory] = useState<number[]>([]);
  const amountPaidInSplit = useMemo(() => paymentsHistory.reduce((acc, v) => acc + v, 0), [paymentsHistory]);

  // Novos estados para alerta de novo pedido
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [latestNewOrder, setLatestNewOrder] = useState<Order | null>(null);

  // Estado para obrigatoriedade de envio de pontos fidelidade
  const [pointsConfirmed, setPointsConfirmed] = useState(false);

  const { isOffline, realtime, internet } = useConnectivity();
  const [bridgeStatus, setBridgeStatus] = useState<{ online: boolean; printerOnline: boolean }>({ online: true, printerOnline: true });

  useEffect(() => {
    const checkBridge = async () => {
      const cfg = loadPrintConfig();
      if (cfg.printMode !== "bridge" || !cfg.bridgeUrl) return;
      try {
        const health = await checkBridgeStatus(cfg.bridgeUrl);
        setBridgeStatus({
          online: !health.error,
          printerOnline: health.printer_connected !== false,
        });
      } catch (e) {
        setBridgeStatus({ online: false, printerOnline: false });
      }
    };
    checkBridge();
    const interval = setInterval(checkBridge, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleStaffMode = () => {
    setStaffMode((v) => {
      const next = !v;
      localStorage.setItem("pdv-staff-mode", next ? "1" : "0");
      return next;
    });
  };

  const { data: orders = [] } = useQuery({
    queryKey: ["pdv-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(quantity)")
        .in("status", ["new", "preparing", "done"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      
      return (data as any[]).map(o => ({
        ...o,
        item_count: (o.order_items ?? []).reduce((sum: number, it: any) => sum + (it.quantity ?? 0), 0)
      })) as (Order & { item_count: number })[];
    },
    refetchInterval: 30000,
  });

  const { data: selectedItems = [] } = useQuery({
    queryKey: ["pdv-items", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase.from("order_items").select("*").eq("order_id", selectedId);
      if (error) throw error;
      return data as OrderItem[];
    },
    enabled: !!selectedId,
  });

  // Impressão MANUAL — reimpressão sob demanda
  const handlePrint = useCallback(async (order: Order) => {
    let result;
    try {
      result = await manualPrintOrder(order);
    } catch (e) {
      console.error(e);
      toast({ title: "Erro inesperado ao imprimir", variant: "destructive" });
      return;
    }
    if (result.ok && result.bridgeOk) {
      toast({ title: "Cupom enviado para impressão!" });
    } else if (result.ok && result.queued) {
      toast({
        title: "Enviado à central de impressão",
        description: "Impressora local indisponível — entrou na fila.",
      });
    } else if (result.reason === "no_items") {
      toast({ title: "Sem itens para imprimir", variant: "destructive" });
    } else {
      toast({
        title: "Falha ao imprimir",
        description: "Bridge local offline e fila indisponível. Verifique a ponte em Admin → Sistema.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const selectedOrder = (orders as (Order & { item_count: number })[]).find((o) => o.id === selectedId) || null;

  useEffect(() => {
    if (selectedId && !orders.some(o => o.id === selectedId)) {
      setSelectedId(null);
      setShowPayment(false);
    }
  }, [selectedId, orders]);

  // Separa em MESAS (dine_in/balcão) e ENTREGAS (delivery + pickup)
  // Ordenação: críticos (>25min) primeiro, depois por horário
  const { tablesOrders, deliveryOrders } = useMemo(() => {
    const tablesOrders: Order[] = [];
    const deliveryOrders: Order[] = [];
    for (const o of orders) {
      if (getOrderGroup(o) === "delivery") deliveryOrders.push(o);
      else tablesOrders.push(o);
    }
    const sortFn = (a: Order, b: Order) => {
      const stageA = Date.now() - new Date(a.updated_at || a.created_at).getTime();
      const stageB = Date.now() - new Date(b.updated_at || b.created_at).getTime();
      const critA = stageA >= 25 * 60000 ? 1 : 0;
      const critB = stageB >= 25 * 60000 ? 1 : 0;
      if (critA !== critB) return critB - critA;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    };
    tablesOrders.sort(sortFn);
    deliveryOrders.sort(sortFn);
    return { tablesOrders, deliveryOrders };
  }, [orders]);

  // Usa as listas originais separadas
  const filteredTables = tablesOrders;
  const filteredDeliveries = deliveryOrders;

  // Contagem de itens por seção
  const tablesItemsTotal = useMemo(
    () => filteredTables.reduce((sum, o) => sum + ((o as any).item_count || 0), 0),
    [filteredTables]
  );
  const deliveryItemsTotal = useMemo(
    () => filteredDeliveries.reduce((sum, o) => sum + ((o as any).item_count || 0), 0),
    [filteredDeliveries]
  );

  // Atalho ESC fecha painel direito
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedId) {
        setSelectedId(null);
        setShowPayment(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  // Pedidos online de entrega não visualizados → disparam sirene
  const { isSeen, markSeen } = useSeenOrders();
  const unseenOnlineDelivery = useMemo(
    () => deliveryOrders.filter((o) => isOnlineOrder(o) && !isSeen(o.id)),
    [deliveryOrders, isSeen]
  );
  // Sirene ativa enquanto houver entrega online não visualizada
  const { needsUnlock: sirenNeedsUnlock, unlock: unlockSiren, mute: muteSiren } = useSiren(unseenOnlineDelivery.length > 0);

  // Alerta visual de novo pedido online (entrega/retirada)
  const announcedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (unseenOnlineDelivery.length > 0) {
      const newOrders = unseenOnlineDelivery.filter(o => !announcedRef.current.has(o.id));
      if (newOrders.length > 0) {
        newOrders.forEach(o => announcedRef.current.add(o.id));
        setLatestNewOrder(newOrders[0]);
        setShowNewOrderModal(true);
        playFeedback("notification");
      }
    }
  }, [unseenOnlineDelivery, playFeedback]);

  // Som curto quando pedido entra em "Prontos p/ Pagamento" (status done)
  const prevDoneIdsRef = useRef<Set<string>>(new Set());
  const initializedDoneRef = useRef(false);
  useEffect(() => {
    const currentDoneIds = new Set(orders.filter((o) => o.status === "done").map((o) => o.id));
    if (!initializedDoneRef.current) {
      prevDoneIdsRef.current = currentDoneIds;
      initializedDoneRef.current = true;
      return;
    }
    let hasNew = false;
    currentDoneIds.forEach((id) => {
      if (!prevDoneIdsRef.current.has(id)) hasNew = true;
    });
    if (hasNew) {
      playFeedback("success");
      window.setTimeout(() => playFeedback("success"), 300);
      const order = orders.find((o) => currentDoneIds.has(o.id) && !prevDoneIdsRef.current.has(o.id));
      if (order) {
        toast({ title: `🔔 Pronto p/ pagamento — ${formatTableLabel(order.table_name, order.original_table_name)}` });
      }
    }
    prevDoneIdsRef.current = currentDoneIds;
  }, [orders, playFeedback, toast]);

  // Auto-promove pedidos "new" → "preparing" (operador opera só com 3 status visuais; "new" é transitório)
  const autoPromotedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const newOnes = orders.filter((o) => o.status === "new" && !autoPromotedRef.current.has(o.id));
    if (newOnes.length === 0) return;
    newOnes.forEach((o) => autoPromotedRef.current.add(o.id));
    (async () => {
      for (const o of newOnes) {
        await supabase.rpc("update_order_status", { p_order_id: o.id, p_status: "preparing" });
      }
      queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
    })();
  }, [orders, queryClient]);

  const handleAdvance = useCallback(async (order: Order) => {
    const nextMap: Record<string, string | null> = { new: "preparing", preparing: "done", done: null };
    const next = nextMap[order.status];
    if (!next) return;

    // Otimístico: atualiza no cache local imediatamente
    const previous = queryClient.getQueryData<Order[]>(["pdv-orders"]);
    queryClient.setQueryData<Order[]>(["pdv-orders"], (old) => {
      if (!old) return old;
      return old.map((o) => (o.id === order.id ? { ...o, status: next, served_at: next === "done" ? new Date().toISOString() : o.served_at } : o));
    });

    playFeedback("click");

    const { error } = await supabase.rpc("update_order_status", { 
      p_order_id: order.id, 
      p_status: next 
    });

    if (error) {
      // Rollback em caso de erro
      if (previous) queryClient.setQueryData(["pdv-orders"], previous);
      toast({ title: "Erro ao avançar status", description: error.message, variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
  }, [queryClient, toast, playFeedback]);

  const handlePayment = async (shouldPrint: boolean) => {
    if (!selectedOrder || sending) return;
    setSending(true);
    setShowPayConfirm(false);
    const total = selectedOrder.total || 0;
    await supabase.rpc("pay_order", {
      p_order_id: selectedOrder.id,
      p_payment_method: "none",
      p_amount_paid: total,
      p_should_print: shouldPrint,
    } as any);

    if (shouldPrint) {
      await enqueuePrintJob(selectedOrder.id, "bill", { total });
    }

    if (shouldPrint) {
      const printConfig = loadPrintConfig();
      const items = selectedItems;
      if (items.length > 0 && printConfig.printMode === "bridge") {
        const custData = wantCustomerData ? { name: customerName || undefined, document: customerDoc || undefined } : null;
        await printCustomerReceipt(
          selectedOrder.table_name,
          selectedOrder.waiter_name || "",
          items,
          total,
          "none",
          total,
          custData
        );
      }
    }

    playFeedback("success");
    toast({ title: shouldPrint ? "Mesa fechada! Comprovante impresso." : "Mesa fechada com sucesso!" });
    queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
    setShowPayment(false);
    setWantCustomerData(false);
    setCustomerName("");
    setCustomerDoc("");
    setSending(false);
    setSelectedId(null);
    setPaymentsHistory([]);
  };

  const confirmPrintAction = (action: () => Promise<void>) => {
    setPendingPrint(() => action);
    setShowPrintConfirm(true);
  };

  const executePendingPrint = async () => {
    setShowPrintConfirm(false);
    if (pendingPrint) {
      await pendingPrint();
      setPendingPrint(null);
    }
  };

  const total = selectedOrder?.total || 0;
  const cfg = selectedOrder ? statusConfig[selectedOrder.status] || statusConfig.new : null;

  return (
    <div className={`min-h-screen-safe flex flex-col bg-background ${staffMode ? "staff-mode" : ""}`}>
      {/* Header */}
      <div className="border-b border-border p-3 sm:p-4 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-[calc(1rem+env(safe-area-inset-top))] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <button onClick={() => navigate("/home")} className="text-muted-foreground shrink-0">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg sm:text-2xl font-black tracking-tight truncate">PDV / CAIXA</h1>
          {(() => {
            const getStatus = () => {
              if (isOffline || internet === "offline") return { label: "SEM INTERNET", color: "bg-destructive text-destructive-foreground" };
              if (realtime !== "online") return { label: "SEM REALTIME", color: "bg-warning text-warning-foreground" };
              if (!bridgeStatus.online) return { label: "BRIDGE OFFLINE", color: "bg-warning text-warning-foreground" };
              if (!bridgeStatus.printerOnline) return { label: "IMPRESSORA OFFLINE", color: "bg-warning text-warning-foreground" };
              return { label: "ONLINE", color: "bg-success text-success-foreground" };
            };
            const s = getStatus();
            return (
              <Badge className={`shrink-0 ${s.color}`}>
                <span className="hidden sm:inline">● {s.label}</span>
                <span className="sm:hidden">● {s.label.split(' ')[0]}</span>
              </Badge>
            );
          })()}
          
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleStaffMode}
            title={staffMode ? "Desativar modo garçom (mostrar admin)" : "Ativar modo garçom (ocultar admin)"}
            className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg border text-xs sm:text-sm font-bold transition-colors ${
              staffMode
                ? "border-warning bg-warning/10 text-warning"
                : "border-border bg-card text-muted-foreground hover:bg-secondary"
            }`}
          >
            {staffMode ? <EyeOff size={18} /> : <Eye size={18} />}
            <span className="hidden xs:inline sm:inline">{staffMode ? "GARÇOM" : "ADMIN"}</span>
          </button>
          <PrintSettingsDialog />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] overflow-hidden">
        {/* Left: Order grid — DUAS SEÇÕES (MESAS / ENTREGAS) */}
        <div className="overflow-y-auto p-3 sm:p-4 space-y-6 border-r border-border">
          {/* SEÇÃO ENTREGAS */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4 px-1">
              <div className="flex items-center gap-3 flex-1">
                <div className="h-px flex-1 bg-orange-500/30" />
                <div className="flex items-center gap-2 text-orange-400">
                  <Bike className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] font-black">{filteredDeliveries.length}</span>
                </div>
                <div className="h-px flex-1 bg-orange-500/30" />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {unseenOnlineDelivery.length > 0 && (
                  <>
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white animate-pulse-active"
                      role="status"
                    >
                      🔔 {unseenOnlineDelivery.length} nova{unseenOnlineDelivery.length > 1 ? "s" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={muteSiren}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[10px] font-bold text-foreground hover:bg-secondary active:scale-95 transition-all"
                    >
                      <BellOff className="w-3 h-3" />
                      Silenciar
                    </button>
                  </>
                )}
                {sirenNeedsUnlock && (
                  <button
                    type="button"
                    onClick={unlockSiren}
                    className="inline-flex items-center gap-1 rounded-lg border border-warning bg-warning px-2 py-1 text-[10px] font-black uppercase text-warning-foreground hover:brightness-110 active:scale-95 transition-all animate-pulse-active"
                  >
                    <Volume2 className="w-3 h-3" />
                    Som
                  </button>
                )}
              </div>
            </div>

            {filteredDeliveries.length === 0 ? (
              <div className="text-sm text-muted-foreground italic px-3 py-4 border border-dashed border-border rounded-lg text-center">
                Nenhuma entrega no momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                {filteredDeliveries.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    itemCount={(order as any).item_count || 0}
                    selected={selectedId === order.id}
                    isUnseen={isOnlineOrder(order) && !isSeen(order.id)}
                    onSelect={() => {
                      markSeen(order.id);
                      setSelectedId(order.id);
                      setShowPayment(false);
                      setPaymentsHistory([]);
                    }}
                    onAdvance={handleAdvance}
                    onPrint={handlePrint}
                    onEdit={(o) => navigate(`/palm?orderId=${o.id}&tableName=${o.table_name}`)}
                    onClose={(o) => { setSelectedId(o.id); setShowPayment(true); }}
                    onCancel={(o) => setCancelTarget(o)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* SEÇÃO MESAS */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 px-1">
              <div className="h-px flex-1 bg-purple-500/30" />
              <div className="flex items-center gap-2 text-purple-400">
                <UtensilsCrossed className="w-5 h-5 shrink-0" />
                <span className="text-[10px] font-black">{filteredTables.length}</span>
              </div>
              <div className="h-px flex-1 bg-purple-500/30" />
            </div>

            {filteredTables.length === 0 ? (
              <div className="text-sm text-muted-foreground italic px-3 py-4 border border-dashed border-border rounded-lg text-center">
                Nenhuma mesa aberta.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                {filteredTables.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    itemCount={(order as any).item_count || 0}
                    selected={selectedId === order.id}
                    onSelect={() => { setSelectedId(order.id); setShowPayment(false); setPaymentsHistory([]); }}
                    onAdvance={handleAdvance}
                    onPrint={handlePrint}
                    onEdit={(o) => navigate(`/palm?orderId=${o.id}&tableName=${o.table_name}`)}
                    onClose={(o) => { setSelectedId(o.id); setShowPayment(true); setPaymentsHistory([]); }}
                    onCancel={(o) => setCancelTarget(o)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Detail panel */}
        <div className="overflow-y-auto p-4 bg-card/50">
          {!selectedOrder ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-lg">Selecione um pedido</p>
            </div>
          ) : showPayment ? (
            /* Payment flow */
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Fechar Conta — {formatTableLabel(selectedOrder.table_name, selectedOrder.original_table_name)}</h2>
              
              <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>TOTAL DA CONTA</span>
                  <span className="text-primary text-xl">R$ {total.toFixed(2)}</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSplitModal(true)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-primary/50 bg-primary/5 p-3 text-sm font-bold text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Split size={18} /> DIVIDIR CONTA
                  </button>
                </div>

                {amountPaidInSplit > 0 && (
                  <div className="space-y-2 border-t border-dashed border-border pt-3">
                    <div className="flex justify-between text-sm font-semibold text-success">
                      <span>VALOR JÁ PAGO</span>
                      <span>R$ {amountPaidInSplit.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base font-black text-foreground">
                      <span>SALDO RESTANTE</span>
                      <span className={total - amountPaidInSplit > 0 ? "text-destructive" : "text-success"}>
                        R$ {Math.max(0, total - amountPaidInSplit).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Customer data section */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="customer-data"
                    checked={wantCustomerData}
                    onCheckedChange={(v) => setWantCustomerData(!!v)}
                  />
                  <label htmlFor="customer-data" className="text-base font-semibold cursor-pointer flex items-center gap-2">
                    <User size={16} />
                    Identificar cliente no comprovante?
                  </label>
                </div>
                {wantCustomerData && (
                  <div className="space-y-2 pl-7">
                    <input
                      type="text"
                      placeholder="Nome / Razão Social"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background p-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="text"
                      placeholder="CPF / CNPJ"
                      value={customerDoc}
                      onChange={(e) => setCustomerDoc(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background p-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowPayment(false); setWantCustomerData(false); setCustomerName(""); setCustomerDoc(""); }}
                  className="flex-1 rounded-lg border border-border p-4 font-bold text-foreground"
                >
                  VOLTAR
                </button>
                <div className="flex-1 flex flex-col gap-1">
                  <button
                    onClick={() => setShowPayConfirm(true)}
                    disabled={sending || (amountPaidInSplit > 0 && amountPaidInSplit < total - 0.01)}
                    className="w-full rounded-lg bg-success p-4 font-bold text-success-foreground disabled:opacity-40 min-h-[56px]"
                  >
                    {sending ? "PROCESSANDO..." : "✅ FECHAR MESA"}
                  </button>
                  {amountPaidInSplit > 0 && amountPaidInSplit < total - 0.01 && (
                    <span className="text-[10px] text-destructive font-bold text-center uppercase">Aguardando quitação total</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Order details */
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-xl font-bold">
                  {isOnlineOrder(selectedOrder) && selectedOrder.customer_name_snapshot
                    ? selectedOrder.customer_name_snapshot
                    : formatTableLabel(selectedOrder.table_name, selectedOrder.original_table_name)}
                </h2>
                <div className="flex items-center gap-1 flex-wrap">
                  {isOnlineOrder(selectedOrder) && (
                    <Badge className="bg-orange-500/15 text-orange-400 border border-orange-500/30">
                      <Wifi className="w-3 h-3 mr-1" />ONLINE
                    </Badge>
                  )}
                  <Badge className="bg-secondary text-foreground">
                    {KIND_LABEL[getOrderKind(selectedOrder)]}
                  </Badge>
                  {cfg && <Badge className={cfg.color}>{cfg.label}</Badge>}
                </div>
              </div>

              {/* Bloco de dados do cliente / entrega — só para pedidos online */}
              {isOnlineOrder(selectedOrder) && (
                <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-2 text-sm break-words">
                  {selectedOrder.customer_phone_snapshot && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-orange-400 shrink-0" aria-hidden="true" />
                      <a
                        href={`tel:${selectedOrder.customer_phone_snapshot}`}
                        className="font-mono font-semibold text-base text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        aria-label={`Ligar para ${selectedOrder.customer_phone_snapshot}`}
                      >
                        {selectedOrder.customer_phone_snapshot}
                      </a>
                    </div>
                  )}
                  {getOrderKind(selectedOrder) === "delivery" && selectedOrder.delivery_address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="text-foreground min-w-0 flex-1">
                        <div className="font-semibold leading-snug">
                          {selectedOrder.delivery_address.street ?? ""}
                          {selectedOrder.delivery_address.number ? `, ${selectedOrder.delivery_address.number}` : ""}
                          {selectedOrder.delivery_address.complement ? ` — ${selectedOrder.delivery_address.complement}` : ""}
                        </div>
                        {selectedOrder.delivery_address.neighborhood && (
                          <div className="text-muted-foreground mt-0.5">Bairro: <span className="text-foreground font-medium">{selectedOrder.delivery_address.neighborhood}</span></div>
                        )}
                        {selectedOrder.delivery_address.reference && (
                          <div className="text-muted-foreground italic mt-0.5">Ref: {selectedOrder.delivery_address.reference}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedOrder.payment_method && (
                    <div className="flex items-start gap-2">
                      <Wallet className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="text-foreground">
                        Pagamento: <span className="font-bold uppercase">{selectedOrder.payment_method}</span>
                        {selectedOrder.change_for ? <span className="text-muted-foreground"> · troco para R$ {Number(selectedOrder.change_for).toFixed(2)}</span> : null}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="text-sm text-muted-foreground space-y-1">
                <div>Garçom: <span className="text-foreground font-semibold">{selectedOrder.waiter_name || "—"}</span></div>
                <div>Horário: <span className="text-foreground font-semibold">
                  {new Date(selectedOrder.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {" — "}
                  {new Date(selectedOrder.created_at).toLocaleDateString("pt-BR")}
                </span></div>
                {selectedOrder.print_status === 'printed' && selectedOrder.printed_at && (
                  <div className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="font-semibold text-xs">
                      Impresso às {new Date(selectedOrder.printed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}
                {selectedOrder.print_status === 'pending' && (
                  <div className="flex items-center gap-1 text-amber-500">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="font-semibold text-xs">Aguardando impressão</span>
                  </div>
                )}
                {selectedOrder.print_status === 'failed' && (
                  <div className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="font-semibold text-xs">
                      Falha na impressão{selectedOrder.print_last_error ? `: ${selectedOrder.print_last_error}` : ''}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-3 space-y-2">
                {selectedItems.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Carregando itens...</p>
                ) : (
                  <>
                    {selectedItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <div className="font-semibold">{item.quantity}x {item.product_name}</div>
                          {item.note && <div className="text-xs text-muted-foreground italic">{item.note}</div>}
                        </div>
                        <div className="font-mono text-sm">R$ {(item.subtotal || 0).toFixed(2)}</div>
                      </div>
                    ))}
                    <div className="border-t border-border pt-2 flex justify-between text-lg font-bold">
                      <span>TOTAL</span>
                      <span className="text-primary">R$ {total.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Linha 1: ações secundárias */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  onClick={() => handlePrint(selectedOrder)}
                  className="rounded-lg border border-border bg-card px-2 py-2.5 font-bold text-sm text-foreground active:scale-95 transition-transform flex items-center justify-center gap-1.5"
                >
                  <Printer size={16} /> Imprimir
                </button>
                <button
                  onClick={() => navigate(`/palm?orderId=${selectedOrder.id}&tableName=${selectedOrder.table_name}`)}
                  disabled={selectedOrder.status === "done"}
                  title={selectedOrder.status === "done" ? "Pedido pronto — avance o status para reabrir e editar" : "Adicionar/remover itens"}
                  className="rounded-lg border border-border bg-card px-2 py-2.5 font-bold text-sm text-foreground active:scale-95 transition-transform flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Pencil size={16} /> Editar
                </button>
                <button
                  onClick={() => setCancelTarget(selectedOrder)}
                  className="rounded-lg border border-destructive/40 bg-destructive/5 px-2 py-2.5 font-bold text-sm text-destructive hover:bg-destructive/10 active:scale-95 transition-transform flex items-center justify-center gap-1.5"
                  title="Cancelar pedido"
                >
                  <X size={16} /> Cancelar
                </button>
              </div>
              {/* Linha 2: ação principal */}
              <div className="pt-1">
                {selectedOrder.status !== "done" && (
                  <button
                    onClick={() => handleAdvance(selectedOrder)}
                    className="w-full rounded-lg bg-success px-4 py-3.5 font-black text-success-foreground active:scale-95 transition-transform flex items-center justify-center gap-2 min-h-[56px]"
                  >
                    <CheckCircle2 size={20} /> {statusConfig[selectedOrder.status]?.nextLabel || "Avançar"}
                  </button>
                )}
                {selectedOrder.status === "done" && (
                  <button
                    onClick={() => setShowPayment(true)}
                    className="w-full rounded-lg bg-gradient-to-r from-primary to-primary/80 px-4 py-3.5 font-black text-primary-foreground active:scale-95 transition-transform flex items-center justify-center gap-2 min-h-[56px]"
                  >
                    <DollarSign size={20} /> FECHAR MESA
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <AlertDialog open={showPayConfirm} onOpenChange={setShowPayConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar fechamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Mesa {selectedOrder ? formatTableLabel(selectedOrder.table_name, selectedOrder.original_table_name) : ""} — Total: R$ {total.toFixed(2)}
              {selectedOrder && getOrderGroup(selectedOrder) === "delivery" && (
                <div className="mt-4 p-4 rounded-xl bg-primary/10 border border-primary/20 flex flex-col gap-4 ring-2 ring-primary/20">
                  <div className="flex items-center gap-3 animate-pulse">
                    <Gift className="text-primary w-6 h-6 shrink-0" />
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-black text-primary uppercase tracking-tight">
                        Enviar pontos para o cliente!
                      </span>
                      <span className="text-[10px] font-bold text-primary/70 uppercase">
                        Lembre-se de creditar no sistema de fidelidade
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3 bg-white/50 p-3 rounded-lg border border-primary/10">
                    <Checkbox 
                      id="confirm-points" 
                      checked={pointsConfirmed} 
                      onCheckedChange={(checked) => setPointsConfirmed(!!checked)}
                      className="mt-1 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <label 
                      htmlFor="confirm-points" 
                      className="text-xs font-bold leading-tight text-primary cursor-pointer select-none"
                    >
                      CONFIRMO QUE OS PONTOS JÁ FORAM ENVIADOS AO CLIENTE OU COMPUTADOS NO SISTEMA.
                    </label>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowPayConfirm(false)}>Cancelar</AlertDialogCancel>
            <button
              onClick={() => handlePayment(false)}
              disabled={sending}
              className="rounded-lg bg-secondary px-4 py-2 font-bold text-foreground disabled:opacity-40"
            >
              {sending ? "..." : "Fechar sem imprimir"}
            </button>
            <button
              onClick={() => handlePayment(true)}
              disabled={sending}
              className="rounded-lg bg-success px-4 py-2 font-bold text-success-foreground disabled:opacity-40"
            >
              {sending ? "..." : "✅ Fechar e imprimir"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPrintConfirm} onOpenChange={setShowPrintConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reimprimir comprovante?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja reimprimir o comprovante da mesa?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowPrintConfirm(false)}>Cancelar</AlertDialogCancel>
            <button
              onClick={executePendingPrint}
              className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground"
            >
              Sim, reimprimir
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Novo Pedido Recebido (Realtime) */}
      <AlertDialog open={showNewOrderModal} onOpenChange={setShowNewOrderModal}>
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-orange-500/10 p-4 ring-8 ring-orange-500/5">
                <Bike className="w-12 h-12 text-orange-500 animate-bounce" />
              </div>
            </div>
            <AlertDialogTitle className="text-2xl font-black text-center uppercase tracking-tight">
              Novo pedido recebido
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-lg font-medium text-foreground pt-2">
              {latestNewOrder && (
                <>
                  <span className="block font-black text-primary">
                    {latestNewOrder.customer_name_snapshot || "Cliente Online"}
                  </span>
                  Acesse a área de entregas/retiradas.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center mt-6">
            <AlertDialogAction
              onClick={() => {
                if (latestNewOrder) markSeen(latestNewOrder.id);
                setShowNewOrderModal(false);
              }}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-6 text-xl rounded-xl"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Dividir Conta */}
      <AlertDialog open={showSplitModal} onOpenChange={setShowSplitModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Split className="text-primary" /> Dividir Conta
            </AlertDialogTitle>
            <AlertDialogDescription>
              Total da conta: <span className="font-bold text-foreground">R$ {total.toFixed(2)}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase text-muted-foreground">Dividir em quantas pessoas?</label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="1"
                  value={splitCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setSplitCount(val);
                    setPartialAmount(((total - amountPaidInSplit) / val).toFixed(2));
                  }}
                  className="w-20 rounded-lg border border-border bg-background p-3 text-center text-lg font-bold"
                />
                <div className="text-sm">
                  Cada pessoa paga: <span className="font-black text-primary">R$ {((total - amountPaidInSplit) / splitCount).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase text-muted-foreground">Valor do pagamento agora</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-muted-foreground font-bold">R$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0,00"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-3 pl-10 text-xl font-black text-foreground focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {paymentsHistory.length > 0 && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-muted-foreground">Pagamentos já realizados</label>
                <div className="max-h-[100px] overflow-y-auto space-y-1">
                  {paymentsHistory.map((v, i) => (
                    <div key={i} className="flex justify-between text-xs font-mono bg-success/5 p-1 rounded border border-success/10">
                      <span>Pagamento {i + 1}</span>
                      <span className="font-bold text-success">R$ {v.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { setPaymentsHistory([]); setPartialAmount(""); }}
                  className="text-[10px] text-destructive font-black uppercase hover:underline"
                >
                  Limpar todos os pagamentos
                </button>
              </div>
            )}

            <div className="rounded-lg bg-secondary/50 p-3 text-sm flex justify-between items-center">
              <span>Saldo restante:</span>
              <span className="font-black text-lg">R$ {Math.max(0, total - amountPaidInSplit - (parseFloat(partialAmount) || 0)).toFixed(2)}</span>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowSplitModal(false)}>CANCELAR</AlertDialogCancel>
            <button
              onClick={() => {
                const val = parseFloat(partialAmount) || 0;
                if (val <= 0) return;
                setPaymentsHistory(prev => [...prev, val]);
                setPartialAmount("");
                setShowSplitModal(false);
                playFeedback("click");
                toast({ title: `Pagamento de R$ ${val.toFixed(2)} registrado!` });
              }}
              className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground"
            >
              CONFIRMAR PAGAMENTO
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Cancelar pedido */}
      <CancelOrderDialog
        order={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={(o) => { if (!o) setCancelTarget(null); }}
        onCancelled={() => {
          queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
          if (cancelTarget && selectedId === cancelTarget.id) {
            setSelectedId(null);
            setShowPayment(false);
          }
          setCancelTarget(null);
        }}
      />
    </div>
  );
};

export default Pdv;
