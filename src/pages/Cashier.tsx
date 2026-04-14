import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Wallet, TrendingDown, TrendingUp, Power, History, Banknote, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Order } from "@/lib/types";
import CloseOrder from "@/components/cashier/CloseOrder";
import { useCashRegister } from "@/hooks/use-cash-register";
import { useFeedback } from "@/hooks/use-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

const Cashier = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { playFeedback } = useFeedback();
  const { register, movements, loading, openRegister, addMovement, closeRegister } = useCashRegister();
  
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [openingAmount, setOpeningAmount] = useState("");
  const [sangriaAmount, setSangriaAmount] = useState("");
  const [sangriaReason, setSangriaReason] = useState("");
  const [showSangria, setShowSangria] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [closingAmount, setClosingAmount] = useState("");

  const userProfile = useMemo(() => {
    const data = localStorage.getItem("user_profile");
    return data ? JSON.parse(data) : null;
  }, []);

  const { data: activeOrders = [] } = useQuery({
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

  const { data: salesToday = 0 } = useQuery({
    queryKey: ["sales-today", register?.id],
    enabled: !!register,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("total")
        .eq("status", "paid")
        .gte("updated_at", register!.opened_at);
      
      return (data || []).reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    },
    refetchInterval: 10000,
  });

  const totalSangrias = movements
    .filter(m => m.type === 'out')
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  
  const totalReforcos = movements
    .filter(m => m.type === 'in')
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  const expectedAmount = (register?.initial_amount || 0) + salesToday + totalReforcos - totalSangrias;

  const handleOpen = () => {
    if (!openingAmount || !userProfile) return;
    openRegister(parseFloat(openingAmount), userProfile.id);
    setOpeningAmount("");
  };

  const handleSangria = () => {
    if (!sangriaAmount || !sangriaReason) return;
    addMovement(parseFloat(sangriaAmount), 'out', sangriaReason);
    setSangriaAmount("");
    setSangriaReason("");
    setShowSangria(false);
  };

  const handleClose = () => {
    if (!closingAmount) return;
    closeRegister(parseFloat(closingAmount));
    setClosingAmount("");
    setShowClosing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!register) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#1a1a1a]">
        <Card className="w-full max-w-md bg-[#222] border-white/10 text-white shadow-2xl">
          <CardHeader className="text-center">
            <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
              <Power className="text-primary h-8 w-8" />
            </div>
            <CardTitle className="text-2xl font-black uppercase tracking-tight">Caixa Fechado</CardTitle>
            <p className="text-white/40 font-bold text-sm uppercase">Abra o caixa para começar o expediente</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-white/40">Valor inicial (Troco)</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-black">R$</span>
                <Input
                  type="number"
                  placeholder="0,00"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  className="bg-[#333] border-white/10 pl-12 h-14 text-xl font-black text-white"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full h-14 font-black uppercase tracking-widest text-lg"
              disabled={!openingAmount}
              onClick={handleOpen}
            >
              🚀 ABRIR CAIXA
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <CloseOrder
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onClosed={() => {
          setSelectedOrder(null);
          queryClient.invalidateQueries({ queryKey: ["cashier-orders"] });
          queryClient.invalidateQueries({ queryKey: ["sales-today"] });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#1a1a1a]">
      <div className="border-b border-white/10 p-4 flex items-center justify-between bg-[#1a1a1a] sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="text-white/60 p-2 hover:bg-white/5 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-black text-white tracking-tighter uppercase">CONTROLE DE CAIXA</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowClosing(true)}
            className="border-primary/50 text-primary font-black uppercase tracking-tighter hover:bg-primary/10"
          >
            FECHAR CAIXA
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Resumo Financeiro */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#222] border border-white/5 rounded-xl p-4">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Inicial</p>
            <p className="text-xl font-black text-white">R$ {register.initial_amount.toFixed(2)}</p>
          </div>
          <div className="bg-[#222] border border-white/5 rounded-xl p-4">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Vendas</p>
            <p className="text-xl font-black text-emerald-500">+ R$ {salesToday.toFixed(2)}</p>
          </div>
          <div className="bg-[#222] border border-white/5 rounded-xl p-4">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Sangrias</p>
            <p className="text-xl font-black text-red-500">- R$ {totalSangrias.toFixed(2)}</p>
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
            <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Total em Caixa</p>
            <p className="text-xl font-black text-primary">R$ {expectedAmount.toFixed(2)}</p>
          </div>
        </div>

        {/* Ações */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => setShowSangria(true)}
            variant="outline"
            className="h-16 border-white/10 bg-[#222] text-white font-black uppercase tracking-widest hover:bg-red-500/10 hover:border-red-500/50"
          >
            <TrendingDown className="mr-2 h-5 w-5 text-red-500" /> SANGRIA
          </Button>
          <Button
            onClick={() => navigate("/palm")}
            variant="outline"
            className="h-16 border-white/10 bg-[#222] text-white font-black uppercase tracking-widest"
          >
            <History className="mr-2 h-5 w-5 text-primary" /> HISTÓRICO
          </Button>
        </div>

        {/* Mesas Abertas */}
        <div className="pt-4">
          <h2 className="text-xs font-black text-white/40 uppercase tracking-[0.2em] mb-4 px-1">Mesas Abertas ({activeOrders.length})</h2>
          
          <div className="grid grid-cols-1 gap-2">
            {activeOrders.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-2xl">
                <p className="text-white/20 font-bold uppercase tracking-widest text-sm">Nenhuma mesa aberta</p>
              </div>
            ) : (
              activeOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-xl bg-[#222] border border-white/5 p-4 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-black text-xl">
                      {order.table_name === "BALCÃO" ? "B" : order.table_name}
                    </div>
                    <div>
                      <p className="font-black text-white uppercase text-base tracking-tight">
                        {order.table_name}
                      </p>
                      <p className="text-xs font-bold text-white/40 uppercase">
                        {order.waiter_name || "—"} • {new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-lg font-black text-primary">R$ {(order.total || 0).toFixed(2)}</p>
                    <Button
                      onClick={() => setSelectedOrder(order)}
                      className="h-12 font-black uppercase text-xs tracking-widest bg-[#333] hover:bg-primary transition-colors border border-white/5"
                    >
                      RECEBER
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sangria Dialog */}
      <Dialog open={showSangria} onOpenChange={setShowSangria}>
        <DialogContent className="bg-[#222] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500 uppercase font-black tracking-tight">
              <TrendingDown className="w-5 h-5" />
              Realizar Sangria
            </DialogTitle>
            <DialogDescription className="text-white/60 font-bold">
              Retirada de valores do caixa.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-white/40">Valor da Retirada</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-black">R$</span>
                <Input
                  type="number"
                  placeholder="0,00"
                  value={sangriaAmount}
                  onChange={(e) => setSangriaAmount(e.target.value)}
                  className="bg-[#333] border-white/10 pl-12 h-12 text-lg font-black"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-white/40">Motivo (Sangria)</Label>
              <Input
                placeholder="Ex: Pagamento de fornecedor"
                value={sangriaReason}
                onChange={(e) => setSangriaReason(e.target.value)}
                className="bg-[#333] border-white/10 h-12 text-sm font-bold"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="destructive"
              className="w-full h-12 font-black uppercase tracking-widest"
              disabled={!sangriaAmount || !sangriaReason}
              onClick={handleSangria}
            >
              CONFIRMAR RETIRADA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Closing Dialog */}
      <Dialog open={showClosing} onOpenChange={setShowClosing}>
        <DialogContent className="bg-[#222] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary uppercase font-black tracking-tight">
              <Power className="w-5 h-5" />
              Fechar Caixa
            </DialogTitle>
            <DialogDescription className="text-white/60 font-bold">
              Confira os valores antes de fechar.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <div className="flex justify-between text-sm border-b border-white/5 pb-2">
              <span className="text-white/40 font-bold uppercase tracking-wider">Inicial:</span>
              <span className="font-black">R$ {register.initial_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-white/5 pb-2">
              <span className="text-white/40 font-bold uppercase tracking-wider">Vendas:</span>
              <span className="font-black text-emerald-500">+ R$ {salesToday.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-white/5 pb-2">
              <span className="text-white/40 font-bold uppercase tracking-wider">Sangrias:</span>
              <span className="font-black text-red-500">- R$ {totalSangrias.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg pt-2">
              <span className="text-primary font-black uppercase tracking-widest">Esperado:</span>
              <span className="font-black text-primary underline underline-offset-4">R$ {expectedAmount.toFixed(2)}</span>
            </div>

            <div className="space-y-2 pt-6">
              <Label className="text-xs font-black uppercase tracking-widest text-white/40">Valor Final Contado</Label>
              <Input
                type="number"
                placeholder="0,00"
                value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)}
                className="bg-[#333] border-white/10 h-14 text-xl font-black text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full h-14 font-black uppercase tracking-widest text-lg"
              disabled={!closingAmount}
              onClick={handleClose}
            >
              🏁 CONFIRMAR FECHAMENTO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cashier;
