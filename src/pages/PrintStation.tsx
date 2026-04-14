import { useEffect, useState, useCallback } from "react";
import { Printer, RefreshCw, AlertCircle, CheckCircle2, Power } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { printReceipt } from "@/lib/print-receipt";
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
  const { toast } = useToast();

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error(error);
      toast({ title: "Erro ao carregar pedidos", variant: "destructive" });
    } else {
      setOrders(data || []);
    }
  }, [toast]);

  const handlePrint = async (order: Order) => {
    const { data: items, error } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);

    if (error || !items) {
      toast({ title: "Erro ao buscar itens do pedido", variant: "destructive" });
      return;
    }

    printReceipt(order.table_name, order.waiter_name || "N/A", items, order.total || 0);
  };

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("print-station")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        async (payload) => {
          const newOrder = payload.new as Order;
          setOrders((prev) => [newOrder, ...prev.slice(0, 9)]);

          if (autoPrint) {
            // Pequeno delay para garantir que os itens do pedido foram inseridos no banco
            setTimeout(() => handlePrint(newOrder), 1000);
            toast({
              title: "Novo pedido recebido!",
              description: `Imprimindo pedido da Mesa ${newOrder.table_name}...`,
            });
          } else {
            toast({
              title: "Novo pedido recebido!",
              description: `Mesa ${newOrder.table_name} aguardando impressão.`,
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setStatus("online");
        else setStatus("offline");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, autoPrint]);

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
                    🖨️ ESTAÇÃO DE IMPRESSÃO — PLANO B
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-medium text-slate-500 tracking-wide">Status:</span>
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
                <div className="flex items-center space-x-2">
                  <Switch
                    id="auto-print"
                    checked={autoPrint}
                    onCheckedChange={setAutoPrint}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                  <Label htmlFor="auto-print" className="font-bold text-slate-700 cursor-pointer">
                    Impressão automática: {autoPrint ? "LIGADA" : "DESLIGADA"}
                  </Label>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Aviso de Configuração */}
            <div className="bg-amber-50 border-b border-amber-100 p-4 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-sm font-semibold text-amber-800">
                  Atenção: Configure sua impressora térmica como <span className="underline">padrão</span> no Windows para a impressão automática funcionar corretamente.
                </p>
              </div>
              <div className="flex items-center gap-3 ml-8">
                <p className="text-xs font-medium text-amber-700">
                  ⚠️ Certifique-se de <span className="font-bold">permitir pop-ups</span> neste site para a impressão abrir automaticamente.
                </p>
              </div>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <RefreshCw className={`w-4 h-4 ${status === "online" ? "animate-spin" : ""}`} />
                  Fila de pedidos recentes
                </h3>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Últimos 10 pedidos
                </span>
              </div>

              <div className="space-y-3">
                {orders.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                    <p className="text-slate-400 font-medium italic">Aguardando novos pedidos...</p>
                  </div>
                ) : (
                  orders.map((order) => (
                    <div
                      key={order.id}
                      className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-primary/30 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center font-black text-slate-400 text-sm border border-slate-100 group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                          #{new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-800 text-lg">Mesa {order.table_name}</h4>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-500 font-semibold">{order.waiter_name || "Sem nome"}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Total:</span>
                            <span className="text-sm font-black text-primary">R$ {Number(order.total).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handlePrint(order)}
                        className="font-bold gap-2 px-4 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700"
                      >
                        <Printer className="w-4 h-4" />
                        REIMPRIMIR
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>

          <div className="p-4 bg-slate-100 border-t border-slate-200 text-center rounded-b-xl">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
              Sincronizado com Supabase Realtime • Plano B Espetaria © 2026
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PrintStation;
