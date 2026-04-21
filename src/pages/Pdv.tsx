import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Printer, DollarSign, AlertCircle, Banknote, CreditCard, QrCode, CheckCircle2, FilePlus, FileText, Receipt, User, Eye, EyeOff } from "lucide-react";
import {
  AlertDialog,
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
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/hooks/use-feedback";
import { formatTableLabel } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderRow } from "@/components/pdv/OrderRow";
import { PrintSettingsDialog } from "@/components/pdv/PrintSettingsDialog";
import { usePdvRealtime } from "@/hooks/use-pdv-realtime";
import { summarizeItemWaiters, formatWaiterTag } from "@/lib/order-items-group";

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

  const { realtimeStatus } = usePdvRealtime();

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
        .select("*")
        .in("status", ["new", "preparing", "done"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Order[];
    },
    refetchInterval: 10000,
  });

  const { data: allItems = [] } = useQuery({
    queryKey: ["pdv-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_items").select("*");
      if (error) throw error;
      return data as OrderItem[];
    },
    refetchInterval: 10000,
  });

  // Impressão MANUAL — reimpressão sob demanda
  const handlePrint = useCallback(async (order: Order) => {
    const success = await manualPrintOrder(order);
    if (!success) {
      toast({ title: "Sem itens para imprimir", variant: "destructive" });
    } else {
      toast({ title: "Cupom enviado para impressão!" });
    }
  }, [toast]);

  const selectedOrder = orders.find((o) => o.id === selectedId) || null;
  const selectedItems = selectedOrder ? allItems.filter((i) => i.order_id === selectedOrder.id) : [];

  // Agrupa pedidos por status + conta itens (mais antigo primeiro dentro de cada grupo)
  const itemsByOrderId = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of allItems) {
      map.set(it.order_id, (map.get(it.order_id) || 0) + (it.quantity || 0));
    }
    return map;
  }, [allItems]);

  const groupedOrders = useMemo(() => {
    const groups: Record<"new" | "preparing" | "done", Order[]> = { new: [], preparing: [], done: [] };
    for (const o of orders) {
      const k = (o.status as "new" | "preparing" | "done");
      if (groups[k]) groups[k].push(o);
    }
    (Object.keys(groups) as Array<keyof typeof groups>).forEach((k) => {
      groups[k].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
    return groups;
  }, [orders]);

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
    const { error } = await supabase.rpc("update_order_status", { p_order_id: order.id, p_status: next });
    if (error) {
      toast({ title: "Erro ao avançar status", description: error.message, variant: "destructive" });
      return;
    }
    playFeedback("click");
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
      const printConfig = loadPrintConfig();
      const items = allItems.filter((i) => i.order_id === selectedOrder.id);
      if (items.length > 0 && printConfig.printMode === "bridge") {
        const custData = wantCustomerData ? { name: customerName || undefined, document: customerDoc || undefined } : null;
        await printCustomerReceipt(
          selectedOrder.table_name,
          selectedOrder.waiter_name || "N/A",
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
          <button onClick={() => navigate("/")} className="text-muted-foreground shrink-0">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg sm:text-2xl font-black tracking-tight truncate">PDV / CAIXA</h1>
          <Badge className={`admin-only shrink-0 ${realtimeStatus === "online" ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}`}>
            <span className="hidden sm:inline">{realtimeStatus === "online" ? "● ONLINE" : "● OFFLINE"}</span>
            <span className="sm:hidden">●</span>
          </Badge>
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
        {/* Left: Order grid */}
        <div className="overflow-y-auto p-4 space-y-3 border-r border-border">
          <h2 className="text-base font-black text-muted-foreground uppercase tracking-wider">
            Fila de Pedidos ({orders.length})
          </h2>
          {orders.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-lg">Aguardando pedidos...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-fr">
              {[...orders]
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    itemCount={itemsByOrderId.get(order.id) || 0}
                    selected={selectedId === order.id}
                    onSelect={() => { setSelectedId(order.id); setShowPayment(false); }}
                    onAdvance={handleAdvance}
                    onPrint={handlePrint}
                    onClose={(o) => { setSelectedId(o.id); setShowPayment(true); }}
                  />
                ))}
            </div>
          )}
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
              <div className="border-t border-border pt-3 flex justify-between text-lg font-bold">
                <span>TOTAL</span>
                <span className="text-primary">R$ {total.toFixed(2)}</span>
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
                <button
                  onClick={() => setShowPayConfirm(true)}
                  disabled={sending}
                  className="flex-1 rounded-lg bg-success p-4 font-bold text-success-foreground disabled:opacity-40 min-h-[56px]"
                >
                  {sending ? "PROCESSANDO..." : "✅ FECHAR MESA"}
                </button>
              </div>
            </div>
          ) : (
            /* Order details */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{formatTableLabel(selectedOrder.table_name, selectedOrder.original_table_name)}</h2>
                {cfg && <Badge className={cfg.color}>{cfg.label}</Badge>}
              </div>
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
                  summarizeItemWaiters(selectedItems, selectedOrder.waiter_name || "").map((item, idx) => {
                    const tag = formatWaiterTag(item.waiters, selectedOrder.waiter_name);
                    return (
                      <div key={`${item.product_id || item.product_name}-${idx}`}>
                        <div className="flex justify-between text-lg gap-2">
                          <span className="font-semibold min-w-0 break-words">
                            {item.quantity}x {item.product_name}
                            {tag && (
                              <span className="ml-2 inline-block text-[10px] uppercase tracking-wide font-bold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded align-middle">
                                {tag}
                              </span>
                            )}
                          </span>
                          <span className="font-bold shrink-0">R$ {item.subtotal.toFixed(2)}</span>
                        </div>
                        {item.note && (
                          <p className="text-sm text-muted-foreground ml-4">OBS: {item.note}</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-border pt-3 flex justify-between text-2xl font-black">
                <span>TOTAL</span>
                <span className="text-primary">R$ {total.toFixed(2)}</span>
              </div>

              {/* Print buttons */}
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-3 gap-2">
                  {selectedOrder.delta_items && (
                    <button
                      onClick={() => confirmPrintAction(async () => {
                        const ok = await manualPrintDelta(selectedOrder);
                        toast({ title: ok ? "Acréscimo impresso!" : "Sem acréscimo para imprimir", variant: ok ? "default" : "destructive" });
                      })}
                      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card p-3 font-semibold text-foreground hover:bg-secondary transition-colors text-sm font-bold min-h-[64px]"
                    >
                      <FilePlus size={16} />
                      ACRÉSCIMO
                    </button>
                  )}
                  <button
                    onClick={() => confirmPrintAction(async () => {
                      const ok = await manualPrintOrder(selectedOrder);
                      if (!ok) toast({ title: "Sem itens para imprimir", variant: "destructive" });
                      else toast({ title: "Cupom enviado para impressão!" });
                    })}
                    className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card p-3 font-semibold text-foreground hover:bg-secondary transition-colors text-sm font-bold min-h-[64px]"
                  >
                    <FileText size={16} />
                    PEDIDO
                  </button>
                  <button
                    onClick={() => confirmPrintAction(async () => {
                      const ok = await manualPrintBill(selectedOrder);
                      toast({ title: ok ? "Conta impressa!" : "Sem itens para imprimir", variant: ok ? "default" : "destructive" });
                    })}
                    className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card p-3 font-semibold text-foreground hover:bg-secondary transition-colors text-sm font-bold min-h-[64px]"
                  >
                    <Receipt size={16} />
                    CONTA
                  </button>
                </div>

                <button
                  onClick={() => { setShowPayment(true); }}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-success p-5 font-black text-success-foreground min-h-[64px] text-lg active:scale-[0.98] transition-all shadow-lg"
                >
                  <DollarSign size={22} /> FECHAR CONTA
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Payment print confirmation */}
      <AlertDialog open={showPayConfirm} onOpenChange={setShowPayConfirm}>
        <AlertDialogContent className="max-w-[90vw] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Tem certeza que quer fechar a mesa?</AlertDialogTitle>
            <AlertDialogDescription>
              Escolha se deseja fechar a conta com ou sem impressão do comprovante.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
            <button
              onClick={() => handlePayment(true)}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary p-4 text-lg font-bold text-primary-foreground active:scale-[0.98] transition-all"
            >
              <Printer size={20} /> Fechar e imprimir
            </button>
            <button
              onClick={() => handlePayment(false)}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-secondary p-4 text-lg font-bold text-secondary-foreground active:scale-[0.98] transition-all"
            >
              <CheckCircle2 size={20} /> Fechar sem imprimir
            </button>
            <AlertDialogCancel className="w-full rounded-xl p-4 h-auto text-base border-none text-muted-foreground">
              Cancelar
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reprint confirmation */}
      <AlertDialog open={showPrintConfirm} onOpenChange={(open) => { setShowPrintConfirm(open); if (!open) setPendingPrint(null); }}>
        <AlertDialogContent className="max-w-[90vw] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Deseja imprimir?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme para enviar a impressão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
            <button
              onClick={executePendingPrint}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary p-4 text-lg font-bold text-primary-foreground active:scale-[0.98] transition-all"
            >
              <Printer size={20} /> Sim, imprimir
            </button>
            <AlertDialogCancel className="w-full rounded-xl p-4 h-auto text-base border-none text-muted-foreground">
              Cancelar
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Pdv;
