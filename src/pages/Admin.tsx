import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, Pencil, Trash2, Eye, EyeOff, Settings, AlertCircle, Printer, RefreshCw, Package, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Product, CATEGORY_LABELS, CATEGORIES } from "@/lib/types";
import ProductForm from "@/components/admin/ProductForm";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { printReceipt } from "@/lib/print-receipt";
import { useFeedback } from "@/hooks/use-feedback";

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
  
  // Stock Entry State
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockReason, setStockReason] = useState("Compra");
  const [savingStock, setSavingStock] = useState(false);

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

  const handleStockEntry = async () => {
    if (!stockProduct || !stockQuantity || savingStock) return;
    setSavingStock(true);
    const qty = parseInt(stockQuantity);
    
    const { error: mvmError } = await supabase.from("stock_movements").insert({
      product_id: stockProduct.id,
      quantity: qty,
      type: 'in',
      reason: stockReason,
    });

    if (mvmError) {
      toast({ title: "Erro ao registrar entrada", variant: "destructive" });
    } else {
      const newStock = (stockProduct.stock_quantity || 0) + qty;
      await supabase.from("products").update({ stock_quantity: newStock }).eq("id", stockProduct.id);
      
      playFeedback("success");
      toast({ title: `Estoque de ${stockProduct.name} atualizado!` });
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      setStockProduct(null);
      setStockQuantity("");
    }
    setSavingStock(false);
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
    <div className="min-h-screen flex flex-col bg-[#1a1a1a]">
      <div className="border-b border-white/10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              playFeedback("click");
              navigate("/");
            }} 
            className="text-white/60"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-black text-white tracking-tighter uppercase">ADMINISTRAÇÃO</h1>
        </div>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <button 
                onClick={() => playFeedback("click")}
                className="p-2 rounded-full hover:bg-white/5 transition-colors text-white/60 mr-2"
              >
                <Settings size={24} />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md bg-[#222] border-white/10 text-white">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary">
                  <Settings className="w-5 h-5" />
                  Configurações
                </DialogTitle>
                <DialogDescription className="text-white/60">
                  Configure mesas e impressão do sistema.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 pt-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="space-y-0.5">
                    <Label className="text-base font-bold">Impressão Automática</Label>
                    <p className="text-xs text-white/40">Imprime novos pedidos assim que chegam</p>
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
                  <h3 className="text-sm font-black flex items-center gap-2 text-white/40 uppercase tracking-widest">
                    <AlertCircle className="w-4 h-4" />
                    Como configurar impressora
                  </h3>
                  <div className="space-y-2 text-sm bg-amber-500/10 p-4 rounded-lg border border-amber-500/20">
                    <p>1. No Windows, defina sua <strong>Impressora Térmica</strong> como <strong>Padrão</strong>.</p>
                    <p>2. Certifique-se de <strong>permitir pop-ups</strong> neste site.</p>
                    <p>3. Nas configurações de impressão do navegador, desmarque a opção <strong>"Cabeçalhos e rodapés"</strong>.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-black flex items-center gap-2 text-white/40 uppercase tracking-widest">
                    Mesas do Restaurante
                  </h3>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                    <button
                      onClick={() => setTableCount((c) => Math.max(1, c - 1))}
                      className="w-10 h-10 rounded-lg bg-[#333] border border-white/10 flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
                    >−</button>
                    <span className="text-2xl font-black text-white flex-1 text-center">{tableCount}</span>
                    <button
                      onClick={() => setTableCount((c) => Math.min(50, c + 1))}
                      className="w-10 h-10 rounded-lg bg-[#333] border border-white/10 flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
                    >+</button>
                  </div>
                  <Button
                    variant="default"
                    className="w-full font-black uppercase tracking-widest"
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
              </div>
            </DialogContent>
          </Dialog>
          <button
            onClick={() => {
              playFeedback("click");
              setShowForm(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-3 font-black text-primary-foreground active:scale-95 transition-transform uppercase text-sm"
          >
            <Plus size={18} /> NOVO PRODUTO
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-2 pb-10">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-black text-white/40 uppercase tracking-[0.2em] px-1">Cardápio & Estoque</h2>
          <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-white/10 text-white/60">
            {products.length} ITENS
          </Badge>
        </div>

        {products.map((product) => (
          <div
            key={product.id}
            className={`flex items-center justify-between rounded-xl bg-[#2a2a2a] border border-white/5 p-4 transition-all ${
              !product.active ? "opacity-60 bg-secondary/50 grayscale-[0.5]" : ""
            }`}
          >
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-2">
                <p className="font-bold text-base text-white truncate">{product.name}</p>
                {product.stock_quantity !== undefined && (
                  <Badge 
                    variant={product.stock_quantity === 0 ? "destructive" : "secondary"}
                    className={`text-[10px] font-black uppercase tracking-tighter h-5 px-1.5 ${
                      product.stock_quantity !== undefined && product.stock_quantity < 10 && product.stock_quantity > 0 
                        ? "bg-amber-500 text-white" 
                        : ""
                    }`}
                  >
                    {product.stock_quantity === 0 ? "ESGOTADO" : `${product.stock_quantity} ${product.unit || 'un'}`}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-white/40 font-bold uppercase tracking-wider">
                {CATEGORY_LABELS[product.category]} • R$ {product.price.toFixed(2)}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStockProduct(product)}
                className="p-2.5 rounded-lg bg-white/5 text-primary active:scale-90 transition-transform flex flex-col items-center gap-0.5"
              >
                <Package size={18} />
                <span className="text-[9px] font-black uppercase">+ ESTOQUE</span>
              </button>

              <div className="flex flex-col items-center gap-1 border-l border-white/10 pl-3">
                <Switch
                  checked={product.active}
                  onCheckedChange={() => handleToggleActive(product.id, !!product.active)}
                  className="data-[state=checked]:bg-primary"
                />
                <span className={`text-[8px] font-black uppercase tracking-tighter ${product.active ? "text-primary" : "text-white/40"}`}>
                  {product.active ? "NO MENU" : "FORA"}
                </span>
              </div>
              
              <div className="flex items-center gap-2 border-l border-white/10 pl-3">
                <button
                  onClick={() => handleEdit(product)}
                  className="p-2 rounded-lg bg-[#333] text-white/80 active:scale-90 transition-transform"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(product.id)}
                  className="p-2 rounded-lg bg-destructive/10 text-destructive active:scale-90 transition-transform"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stock Entry Dialog */}
      <Dialog open={!!stockProduct} onOpenChange={(open) => !open && setStockProduct(null)}>
        <DialogContent className="bg-[#222] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary uppercase font-black tracking-tight">
              <Package className="w-5 h-5" />
              Entrada de Estoque
            </DialogTitle>
            <DialogDescription className="text-white/60 font-bold">
              {stockProduct?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-white/40">Quantidade a Adicionar</Label>
              <Input
                type="number"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                placeholder="Ex: 50"
                className="bg-[#333] border-white/10 text-white font-bold h-12 text-lg"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-white/40">Motivo</Label>
              <div className="grid grid-cols-2 gap-2">
                {['Compra', 'Ajuste', 'Devolução', 'Outro'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setStockReason(r)}
                    className={`p-3 rounded-lg border text-xs font-black uppercase transition-all ${
                      stockReason === r ? "bg-primary border-primary text-primary-foreground" : "bg-white/5 border-white/10 text-white/60"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full h-12 font-black uppercase tracking-widest"
              disabled={!stockQuantity || savingStock}
              onClick={handleStockEntry}
            >
              {savingStock ? "REGISTRANDO..." : "✅ CONFIRMAR ENTRADA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
