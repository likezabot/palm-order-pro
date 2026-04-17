import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, Pencil, Trash2, Settings, AlertCircle, Printer, RefreshCw, ShoppingBag, Clock, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Product, CATEGORY_LABELS, Order } from "@/lib/types";
import ProductForm from "@/components/admin/ProductForm";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/hooks/use-feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PrintConfigPanel from "@/components/admin/PrintConfigPanel";
import { manualPrintOrder } from "@/lib/print-service";
import { forceUpdate } from "@/lib/force-update";
import { getAppVersion } from "@/lib/version-check";

const Admin = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playFeedback } = useFeedback();
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem("pdv_autoprint") !== "false");
  const [tableCount, setTableCount] = useState(10);
  const [savingTables, setSavingTables] = useState(false);
  const [activeTab, setActiveTab] = useState("products");

  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "table_count").single().then(({ data }) => {
      if (data) setTableCount(Number(data.value));
    });
  }, []);

  useEffect(() => {
    localStorage.setItem("pdv_autoprint", String(autoPrint));
  }, [autoPrint]);

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("category")
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: activeOrders = [] } = useQuery({
    queryKey: ["admin-active-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["new", "preparing", "done"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
    refetchInterval: 5000,
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este produto?")) return;
    playFeedback("heavy");
    await supabase.from("products").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    toast({ title: "Produto excluído" });
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    playFeedback("click");
    const { error } = await supabase
      .from("products")
      .update({ active: !current })
      .eq("id", id);
    
    if (error) {
      playFeedback("error");
      toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message });
      return;
    }
    
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    toast({ title: !current ? "Item ativado no cardápio" : "Item removido do cardápio" });
  };

  const handleEdit = (product: Product) => {
    playFeedback("click");
    setEditing(product);
    setShowForm(true);
  };

  const handleSaved = () => {
    playFeedback("success");
    setShowForm(false);
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  const handlePrintOrder = async (order: Order) => {
    playFeedback("click");
    const success = await manualPrintOrder(order);
    if (success) {
      toast({ title: `Imprimindo Mesa ${order.table_name}` });
    }
  };

  const handleEditOrder = (order: Order) => {
    playFeedback("click");
    navigate(`/palm?orderId=${order.id}&tableName=${order.table_name}`);
  };

  if (showForm) {
    return (
      <ProductForm
        product={editing}
        onBack={() => { 
          playFeedback("click");
          setShowForm(false); 
          setEditing(null); 
        }}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <div className="border-b border-border p-4 flex items-center justify-between bg-white shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              playFeedback("click");
              navigate("/");
            }} 
            className="text-muted-foreground hover:bg-secondary p-2 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-black uppercase tracking-tight">Painel de Controle</h1>
        </div>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <button 
                onClick={() => playFeedback("click")}
                className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground mr-2"
              >
                <Settings size={24} />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Configurações Gerais
                </DialogTitle>
                <DialogDescription>
                  Configure mesas e impressão do sistema.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 pt-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                  <div className="space-y-0.5">
                    <Label className="text-base font-bold">Impressão Automática</Label>
                    <p className="text-xs text-muted-foreground">Imprime novos pedidos assim que chegam</p>
                  </div>
                  <Switch 
                    checked={autoPrint} 
                    onCheckedChange={(val) => {
                      playFeedback("click");
                      setAutoPrint(val);
                    }} 
                  />
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                    <AlertCircle className="w-4 h-4" />
                    Como configurar impressora
                  </h3>
                  <div className="space-y-2 text-sm bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-100 dark:border-amber-900/50">
                    <p>1. No Windows, defina sua <strong>Impressora Térmica</strong> como <strong>Padrão</strong>.</p>
                    <p>2. Certifique-se de <strong>permitir pop-ups</strong> neste site.</p>
                    <p>3. Nas configurações de impressão do navegador, desmarque a opção "Cabeçalhos e rodapés".</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                    Mesas do Restaurante
                  </h3>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
                    <button
                      onClick={() => setTableCount((c) => Math.max(1, c - 1))}
                      className="w-10 h-10 rounded-lg bg-card border border-border flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
                    >−</button>
                    <span className="text-2xl font-black text-foreground flex-1 text-center">{tableCount}</span>
                    <button
                      onClick={() => setTableCount((c) => Math.min(30, c + 1))}
                      className="w-10 h-10 rounded-lg bg-card border border-border flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
                    >+</button>
                  </div>
                  <Button
                    variant="default"
                    className="w-full font-bold"
                    disabled={savingTables}
                    onClick={async () => {
                      setSavingTables(true);
                      const { error } = await supabase
                        .from("settings")
                        .update({ value: String(tableCount) })
                        .eq("key", "table_count");
                      setSavingTables(false);
                      if (error) {
                        toast({ variant: "destructive", title: "Erro ao salvar" });
                      } else {
                        playFeedback("success");
                        toast({ title: `Mesas atualizadas para ${tableCount}` });
                      }
                    }}
                  >
                    {savingTables ? "Salvando..." : "SALVAR MESAS"}
                  </Button>
                </div>

                <Button 
                  variant="secondary" 
                  className="w-full gap-2 font-bold"
                  onClick={() => navigate("/print-station")}
                >
                  <RefreshCw className="w-4 h-4" />
                  ABRIR ESTAÇÃO DE IMPRESSÃO
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <button
            onClick={() => {
              playFeedback("click");
              setShowForm(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground active:scale-95 shadow-lg shadow-primary/20 transition-all"
          >
            <Plus size={18} /> NOVO PRODUTO
          </button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="bg-white border-b border-border px-4">
          <TabsList className="bg-transparent h-14 gap-6">
            <TabsTrigger value="products" className="font-bold text-sm h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-0">
              Cardápio
            </TabsTrigger>
            <TabsTrigger value="orders" className="font-bold text-sm h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-0 flex gap-2">
              <ShoppingBag className="w-4 h-4" /> Editor de Pedidos
            </TabsTrigger>
            <TabsTrigger value="print" className="font-bold text-sm h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-0 flex gap-2">
              <Printer className="w-4 h-4" /> Impressão
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="products" className="flex-1 p-4 space-y-3 pb-10 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {products.map((product) => (
              <div
                key={product.id}
                className={`flex items-center justify-between rounded-xl bg-white border border-border p-4 shadow-sm transition-all hover:shadow-md ${
                  !product.active ? "opacity-60 bg-slate-50 grayscale-[0.5]" : ""
                }`}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <p className="font-bold text-base truncate text-slate-900">{product.name}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                    {CATEGORY_LABELS[product.category]} • R$ {product.price.toFixed(2)}
                    {!product.active && <span className="text-destructive ml-1">• INATIVO</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <Switch
                      checked={product.active}
                      onCheckedChange={() => handleToggleActive(product.id, !!product.active)}
                    />
                  </div>
                  <div className="flex items-center gap-2 border-l border-border pl-3">
                    <button
                      onClick={() => handleEdit(product)}
                      className="p-2.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="p-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="orders" className="flex-1 p-4 space-y-3 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeOrders.length === 0 ? (
              <div className="col-span-full py-12 text-center text-muted-foreground bg-white rounded-xl border-2 border-dashed">
                Nenhum pedido ativo no momento
              </div>
            ) : (
              activeOrders.map((order) => (
                <div key={order.id} className="bg-white border border-border rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black">Mesa {order.table_name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold">
                        <Clock size={12} />
                        {new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-primary font-black text-lg">R$ {(order.total || 0).toFixed(2)}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">{order.waiter_name || "Garçom"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      className="gap-2 font-bold h-12 border-2"
                      onClick={() => handlePrintOrder(order)}
                    >
                      <Printer size={18} /> IMPRIMIR
                    </Button>
                    <Button 
                      variant="default" 
                      className="gap-2 font-bold h-12"
                      onClick={() => handleEditOrder(order)}
                    >
                      <Pencil size={18} /> EDITAR
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="print" className="flex-1 p-4 mt-0 bg-white border-t">
          <div className="max-w-2xl mx-auto py-4">
            <PrintConfigPanel />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;