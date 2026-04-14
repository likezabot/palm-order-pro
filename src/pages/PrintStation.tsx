import { useEffect, useState, useCallback, useRef } from "react";
import { Printer, RefreshCw, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { autoPrintOrder, manualPrintOrder } from "@/lib/print-service";
import { Order } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PrintStation = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [autoPrint, setAutoPrint] = useState(true);
  const [status, setStatus] = useState<"online" | "offline">("online");
  const [printedIds, setPrintedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Refs estáveis para uso dentro do listener Realtime
  const autoPrintRef = useRef(autoPrint);
  const printingRef = useRef<Set<string>>(new Set()); // guard local contra re-entrada

  useEffect(() => {
    autoPrintRef.current = autoPrint;
  }, [autoPrint]);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error(error);
    } else {
      setOrders(data || []);
      // Marcar pedidos que já têm printed_at
      const printed = new Set<string>();
      (data || []).forEach((o: any) => {
        if (o.printed_at) printed.add(o.id);
      });
      setPrintedIds(printed);
    }
  }, []);

  const handleManualPrint = useCallback(async (order: Order) => {
    const success = await manualPrintOrder(order);
    if (!success) {
      toast({ title: "Sem itens para imprimir", variant: "destructive" });
    } else {
      toast({ title: `Reimprimindo Mesa ${order.table_name}...` });
    }
  }, [toast]);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("print-station-v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        async (payload) => {
          const newOrder = payload.new as Order;
          setOrders((prev) => [newOrder, ...prev.slice(0, 19)]);

          // Guard: não re-entrar se já estamos processando este pedido
          if (printingRef.current.has(newOrder.id)) return;

          if (autoPrintRef.current) {
            printingRef.current.add(newOrder.id);

            // Pequeno delay para itens chegarem ao banco
            await new Promise((r) => setTimeout(r, 1200));

            const result = await autoPrintOrder(newOrder);

            if (result.printed) {
              setPrintedIds((prev) => new Set(prev).add(newOrder.id));
              toast({
                title: "Pedido impresso!",
                description: `Mesa ${newOrder.table_name} — impressão automática.`,
              });
            } else if (result.reason === "already_printed") {
              setPrintedIds((prev) => new Set(prev).add(newOrder.id));
            }
            // Não remover de printingRef - é um guard de sessão
          } else {
            toast({
              title: "Novo pedido recebido!",
              description: `Mesa ${newOrder.table_name} — impressão automática desligada.`,
            });
          }
        }
      )
      .subscribe((s) => {
        setStatus(s === "SUBSCRIBED" ? "online" : "offline");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, toast]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <Card className="border-2 border-slate-200 shadow-xl">
          <CardHeader className="bg-white border-b border-slate-100 py-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-full">
                  <Printer className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black text-slate-800">
                    🖨️ ESTAÇÃO DE IMPRESSÃO
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-medium text-slate-500">Status:</span>
                    <Badge
                      variant={status === "online" ? "default" : "destructive"}
                      className={`uppercase text-[10px] font-bold px-2 py-0.5 ${
                        status === "online" ? "bg-emerald-500 hover:bg-emerald-600" : ""
                      }`}
                    >
                      {status === "online" ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                          ONLINE
                        </span>
                      ) : (
                        "OFFLINE"
                      )}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-slate-100 px-4 py-2 rounded-xl">
                <Switch
                  id="auto-print"
                  checked={autoPrint}
                  onCheckedChange={setAutoPrint}
                  className="data-[state=checked]:bg-emerald-500"
                />
                <Label htmlFor="auto-print" className="font-bold text-slate-700 cursor-pointer">
                  Auto-print: {autoPrint ? "LIGADA" : "DESLIGADA"}
                </Label>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Aviso técnico sobre silent print */}
            <div className="bg-blue-50 border-b border-blue-100 p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 space-y-1">
                <p className="font-semibold">Sobre impressão automática:</p>
                <p>
                  O navegador sempre exibirá o diálogo de impressão. Impressão totalmente
                  silenciosa (sem diálogo) <strong>não é suportada por navegadores comuns</strong>.
                  Para isso é necessário modo kiosk do Chrome, app desktop (Electron) ou
                  integrador local de impressão.
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  💡 Dica: defina sua impressora térmica como padrão e desmarque "Cabeçalhos e rodapés" nas configurações de impressão do navegador.
                </p>
              </div>
            </div>

            {/* Aviso de configuração */}
            <div className="bg-amber-50 border-b border-amber-100 p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm font-semibold text-amber-800">
                Esta é a <strong>única estação autorizada</strong> para autoimpressão. O PDV permite apenas reimpressão manual.
              </p>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <RefreshCw className={`w-4 h-4 ${status === "online" ? "animate-spin" : ""}`} />
                  Fila de pedidos recentes
                </h3>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Últimos 20 pedidos
                </span>
              </div>

              <div className="space-y-3">
                {orders.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                    <p className="text-slate-400 font-medium italic">Aguardando novos pedidos...</p>
                  </div>
                ) : (
                  orders.map((order) => {
                    const wasPrinted = printedIds.has(order.id);
                    return (
                      <div
                        key={order.id}
                        className={`group flex items-center justify-between p-4 bg-white border rounded-xl hover:shadow-md transition-all duration-200 ${
                          wasPrinted ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center font-black text-slate-400 text-sm border border-slate-100">
                            {new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-800 text-lg">Mesa {order.table_name}</h4>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-500 font-semibold">{order.waiter_name || "Sem nome"}</span>
                              {wasPrinted && (
                                <Badge className="bg-emerald-100 text-emerald-700 text-[10px] font-bold border-0">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  IMPRESSO
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs font-bold text-slate-400 uppercase">Total:</span>
                              <span className="text-sm font-black text-primary">R$ {Number(order.total).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleManualPrint(order)}
                          className="font-bold gap-2 px-4 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700"
                        >
                          <Printer className="w-4 h-4" />
                          REIMPRIMIR
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </CardContent>

          <div className="p-4 bg-slate-100 border-t border-slate-200 text-center rounded-b-xl">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
              Estação de impressão centralizada • Plano B Espetaria © 2026
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PrintStation;
