import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Printer, DollarSign, Settings, AlertCircle, RefreshCw, Banknote, CreditCard, QrCode, CheckCircle2, FilePlus, FileText, Receipt, User } from "lucide-react";
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
import { manualPrintOrder, manualPrintDelta, manualPrintBill, autoPrintOrder, autoPrintDelta } from "@/lib/print-service";
import { printTest, getPaperWidth, setPaperWidth, printCustomerReceipt } from "@/lib/print-receipt";
import { loadPrintConfig } from "@/lib/print-config";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/hooks/use-feedback";
import { formatTableLabel } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

const PAYMENT_METHODS = [
  { key: "cash", label: "DINHEIRO", icon: Banknote, color: "bg-emerald-500" },
  { key: "pix", label: "PIX", icon: QrCode, color: "bg-cyan-500" },
  { key: "card", label: "CARTÃO", icon: CreditCard, color: "bg-blue-500" },
] as const;

const statusConfig: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  new: { label: "NOVO", color: "bg-primary text-primary-foreground", next: "preparing", nextLabel: "▶ PREPARAR" },
  preparing: { label: "PREPARO", color: "bg-warning text-warning-foreground", next: "done", nextLabel: "✅ PRONTO" },
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
  const [payMethod, setPayMethod] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [sending, setSending] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"online" | "offline">("offline");
  const [wantCustomerData, setWantCustomerData] = useState(false);
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [pendingPrint, setPendingPrint] = useState<(() => Promise<void>) | null>(null);
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerDoc, setCustomerDoc] = useState("");

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

  // Guard de idempotência
  const printedEventsRef = useRef<Set<string>>(new Set());
  const printingNowRef = useRef<Set<string>>(new Set());
  const toastRef = useRef(toast);
  const playFeedbackRef = useRef(playFeedback);

  useEffect(() => { toastRef.current = toast; }, [toast]);
  useEffect(() => { playFeedbackRef.current = playFeedback; }, [playFeedback]);

  // Ref-based auto-print — never changes identity, so Realtime subscription stays stable
  const tryAutoPrintRef = useRef(async (order: Order, eventKey: string, isUpdate: boolean) => {
    if (printedEventsRef.current.has(eventKey)) return;
    if (printingNowRef.current.has(order.id)) return;

    printedEventsRef.current.add(eventKey);
    printingNowRef.current.add(order.id);

    console.log(`[PDV AutoPrint] Aguardando itens do pedido ${order.id} (Mesa ${order.table_name})...`);
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const result = isUpdate
        ? await autoPrintDelta(order)
        : await autoPrintOrder(order);

      if (result.printed) {
        const msg = result.reason === "delta_success"
          ? `Acréscimo impresso — Mesa ${order.table_name}`
          : `Impresso automaticamente — Mesa ${order.table_name}`;
        console.log(`[PDV AutoPrint] ${msg}`);
        toastRef.current({ title: msg });
      } else {
        console.warn(`[PDV AutoPrint] Não imprimiu: ${result.reason}`);
      }
    } catch (error) {
      console.error("[PDV AutoPrint] Falha na autoimpressão:", error);
    } finally {
      printingNowRef.current.delete(order.id);
    }
  });

  // Realtime — subscription estável (sem dependências instáveis)
  useEffect(() => {
    console.log("[PDV] Inscrevendo canal Realtime...");

    const channel = supabase
      .channel("pdv-realtime-v3")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
        queryClient.invalidateQueries({ queryKey: ["pdv-items"] });
        const newOrder = payload.new as Order;
        console.log(`[PDV Realtime] INSERT recebido: ${newOrder.id} — Mesa ${newOrder.table_name}`);
        playFeedbackRef.current("notification");
        toastRef.current({ title: `Novo pedido! Mesa ${newOrder.table_name}` });
        const eventKey = `${newOrder.id}:insert`;
        tryAutoPrintRef.current(newOrder, eventKey, false);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
        const updated = payload.new as Order;
        const old = payload.old as Partial<Order>;
        // Com REPLICA IDENTITY FULL, old tem todos os campos
        const totalChanged = updated.total !== old.total;
        const printReset = updated.print_status === 'pending' && (old as Partial<Order>).print_status !== 'pending';
        
        if (totalChanged || printReset) {
          console.log(`[PDV Realtime] UPDATE relevante: ${updated.id} — Mesa ${updated.table_name} (totalChanged=${totalChanged}, printReset=${printReset})`);
          const eventKey = `${updated.id}:upd:${updated.updated_at}`;
          tryAutoPrintRef.current(updated, eventKey, true); // isUpdate=true → imprime delta
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pdv-items"] });
      })
      .subscribe((status) => {
        console.log(`[PDV Realtime] Status: ${status}`);
        setRealtimeStatus(status === "SUBSCRIBED" ? "online" : "offline");
      });

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]); // Apenas queryClient — estável

  const selectedOrder = orders.find((o) => o.id === selectedId) || null;
  const selectedItems = selectedOrder ? allItems.filter((i) => i.order_id === selectedOrder.id) : [];

  const updateStatus = async (orderId: string, status: string) => {
    playFeedback("click");
    await supabase.rpc("update_order_status", { p_order_id: orderId, p_status: status } as any);
    queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
  };

  const handlePayment = async (shouldPrint: boolean) => {
    if (!selectedOrder || !payMethod || sending) return;
    setSending(true);
    setShowPayConfirm(false);
    const total = selectedOrder.total || 0;
    const paid = payMethod === "cash" ? (parseFloat(amountPaid) || 0) : total;
    await supabase.rpc("pay_order", { p_order_id: selectedOrder.id, p_payment_method: payMethod, p_amount_paid: paid, p_should_print: shouldPrint } as any);
    
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
          payMethod,
          paid,
          custData
        );
      }
    }

    playFeedback("success");
    toast({ title: shouldPrint ? "Mesa fechada! Comprovante impresso." : "Mesa fechada com sucesso!" });
    queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
    setShowPayment(false);
    setPayMethod("");
    setAmountPaid("");
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
  const paid = parseFloat(amountPaid) || 0;
  const change = paid - total;
  const cfg = selectedOrder ? statusConfig[selectedOrder.status] || statusConfig.new : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="text-muted-foreground">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">PDV / CAIXA</h1>
          <Badge className={realtimeStatus === "online" ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}>
            {realtimeStatus === "online" ? "● ONLINE" : "● OFFLINE"}
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          <Dialog>
            <DialogTrigger asChild>
              <button className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground">
                <Settings size={24} />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Configurações de Impressão
                </DialogTitle>
                <DialogDescription>
                  Configure a largura do papel e faça testes de impressão.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 pt-4">
                {/* Info: auto-print centralizado */}
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50">
                  <p className="text-sm text-emerald-800 dark:text-emerald-200">
                    <strong>✅ Impressão automática ATIVA</strong> — pedidos novos e atualizações são impressos automaticamente nesta tela.
                    O botão abaixo serve apenas para reimpressão manual.
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                    Largura do Papel
                  </h3>
                  <div className="flex gap-2">
                    {(["58mm", "80mm"] as const).map((w) => (
                      <Button
                        key={w}
                        variant={getPaperWidth() === w ? "default" : "outline"}
                        className="flex-1 font-bold"
                        onClick={() => {
                          setPaperWidth(w);
                          toast({ title: `Papel alterado para ${w}` });
                        }}
                      >
                        {w}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                    <AlertCircle className="w-4 h-4" />
                    Como configurar impressora
                  </h3>
                  <div className="space-y-2 text-sm bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-100 dark:border-amber-900/50">
                    <p>1. No Windows, defina sua <strong>Impressora Térmica</strong> como <strong>Padrão</strong>.</p>
                    <p>2. Nas configurações de impressão do navegador, desmarque <strong>"Cabeçalhos e rodapés"</strong>.</p>
                    <p>3. Impressão silenciosa (sem diálogo) requer <strong>modo kiosk</strong> ou <strong>app desktop</strong>.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full gap-2 font-bold"
                    onClick={async () => {
                      const ok = await printTest();
                      if (ok) {
                        toast({ title: "Teste enviado!", description: "Verifique o cupom na impressora." });
                      } else {
                        toast({ 
                          title: "Impressão bloqueada", 
                          description: "O modo navegador não permite imprimir. Mude para o modo app desktop/ponte.",
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    <Printer className="w-4 h-4" />
                    🖨️ IMPRIMIR TESTE
                  </Button>
                  
                  <Button 
                    variant="secondary" 
                    className="w-full gap-2 font-bold"
                    onClick={() => navigate("/print-station")}
                  >
                    <RefreshCw className="w-4 h-4" />
                    ABRIR ESTAÇÃO DE IMPRESSÃO
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] overflow-hidden">
        {/* Left: Order list */}
        <div className="overflow-y-auto p-4 space-y-2 border-r border-border">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Fila de Pedidos ({orders.length})
          </h2>
          {orders.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">Aguardando pedidos...</div>
          ) : (
            orders.map((order) => {
              const s = statusConfig[order.status] || statusConfig.new;
              const time = new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              const wasPrinted = order.print_status === 'printed';
              return (
                <button
                  key={order.id}
                  onClick={() => { setSelectedId(order.id); setShowPayment(false); }}
                  className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all text-left ${
                    selectedId === order.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">{time}</div>
                    </div>
                    <div>
                      <div className="font-bold text-lg flex items-center gap-2">
                        {formatTableLabel(order.table_name, order.original_table_name)}
                        {order.original_table_name && order.table_name !== order.original_table_name && order.table_name !== "BALCÃO" && (
                          <span className="text-xs font-bold text-muted-foreground">(Mesa {order.original_table_name})</span>
                        )}
                        {wasPrinted && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      </div>
                      <div className="text-sm text-muted-foreground">{order.waiter_name || "—"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-primary">R$ {(order.total || 0).toFixed(2)}</span>
                    <Badge className={s.color}>{s.label}</Badge>
                  </div>
                </button>
              );
            })
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
              <h2 className="text-xl font-bold">Fechar Conta — Mesa {selectedOrder.table_name}</h2>
              <div className="border-t border-border pt-3 flex justify-between text-lg font-bold">
                <span>TOTAL</span>
                <span className="text-primary">R$ {total.toFixed(2)}</span>
              </div>

              <p className="font-semibold">Forma de pagamento:</p>
              <div className="grid grid-cols-3 gap-3">
                {PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm.key}
                    onClick={() => setPayMethod(pm.key)}
                    className={`rounded-lg border p-3 text-base font-semibold transition-all active:scale-95 ${
                      payMethod === pm.key
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>

              {payMethod === "cash" && (
                <div className="space-y-2">
                  <input
                    type="number"
                    placeholder="Valor recebido"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="w-full rounded-lg border border-border bg-card p-4 text-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {paid >= total && (
                    <p className="text-lg font-bold text-success">Troco: R$ {change.toFixed(2)}</p>
                  )}
                </div>
              )}
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
                  disabled={!payMethod || sending || (payMethod === "cash" && paid < total)}
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
                <h2 className="text-xl font-bold">Mesa {selectedOrder.table_name}</h2>
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
                  selectedItems.map((item) => (
                    <div key={item.id}>
                      <div className="flex justify-between text-base">
                        <span>{item.quantity}x {item.product_name}</span>
                        <span className="font-semibold">R$ {item.subtotal.toFixed(2)}</span>
                      </div>
                      {item.note && (
                        <p className="text-sm text-muted-foreground ml-4">OBS: {item.note}</p>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-border pt-3 flex justify-between text-lg font-bold">
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
                      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card p-3 font-semibold text-foreground hover:bg-secondary transition-colors text-xs min-h-[56px]"
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
                    className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card p-3 font-semibold text-foreground hover:bg-secondary transition-colors text-xs min-h-[56px]"
                  >
                    <FileText size={16} />
                    PEDIDO
                  </button>
                  <button
                    onClick={() => confirmPrintAction(async () => {
                      const ok = await manualPrintBill(selectedOrder);
                      toast({ title: ok ? "Conta impressa!" : "Sem itens para imprimir", variant: ok ? "default" : "destructive" });
                    })}
                    className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card p-3 font-semibold text-foreground hover:bg-secondary transition-colors text-xs min-h-[56px]"
                  >
                    <Receipt size={16} />
                    CONTA
                  </button>
                </div>

                {/* CTA principal: sempre FECHAR CONTA — independe do status */}
                <button
                  onClick={() => { setShowPayment(true); setPayMethod(""); setAmountPaid(""); }}
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
            <AlertDialogTitle className="text-xl">Deseja imprimir?</AlertDialogTitle>
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
