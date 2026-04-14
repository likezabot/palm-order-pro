import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, Pencil, Trash2, Eye, EyeOff, Settings, AlertCircle, Printer, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Product, CATEGORY_LABELS, CATEGORIES } from "@/lib/types";
import ProductForm from "@/components/admin/ProductForm";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { printReceipt } from "@/lib/print-receipt";

const Admin = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem("pdv_autoprint") !== "false");

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
    await supabase.from("products").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    toast({ title: "Produto excluído" });
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("products")
      .update({ active: !current })
      .eq("id", id);
    
    if (error) {
      toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message });
      return;
    }
    
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    toast({ title: !current ? "Item ativado no cardápio" : "Item removido do cardápio" });
  };

  const handleEdit = (product: Product) => {
    setEditing(product);
    setShowForm(true);
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  if (showForm) {
    return (
      <ProductForm
        product={editing}
        onBack={() => { setShowForm(false); setEditing(null); }}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="text-muted-foreground">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">ADMIN</h1>
        </div>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <button className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground mr-2">
                <Settings size={24} />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Configurações de Impressão
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6 pt-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                  <div className="space-y-0.5">
                    <Label className="text-base font-bold">Impressão Automática</Label>
                    <p className="text-xs text-muted-foreground">Imprime novos pedidos assim que chegam</p>
                  </div>
                  <Switch checked={autoPrint} onCheckedChange={setAutoPrint} />
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                    <AlertCircle className="w-4 h-4" />
                    Como configurar impressora
                  </h3>
                  <div className="space-y-2 text-sm bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-100 dark:border-amber-900/50">
                    <p>1. No Windows, defina sua <strong>Impressora Térmica</strong> como <strong>Padrão</strong>.</p>
                    <p>2. Certifique-se de <strong>permitir pop-ups</strong> neste site.</p>
                    <p>3. Nas configurações de impressão do navegador, desmarque a opção <strong>"Cabeçalhos e rodapés"</strong>.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full gap-2 font-bold"
                    onClick={() => {
                      printReceipt("Mesa TESTE", "Admin", [{ product_name: "Item de Teste", quantity: 1, product_price: 10, note: "Teste de impressão" }], 10);
                      toast({ title: "Teste enviado", description: "Verifique se o cupom abriu corretamente." });
                    }}
                  >
                    <Printer className="w-4 h-4" />
                    TESTAR IMPRESSÃO
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
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-primary-foreground active:scale-95 transition-transform"
          >
            <Plus size={18} /> NOVO
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-2 pb-10">
        {products.map((product) => (
          <div
            key={product.id}
            className={`flex items-center justify-between rounded-lg bg-card border border-border p-4 transition-all ${
              !product.active ? "opacity-60 bg-secondary/50 grayscale-[0.5]" : ""
            }`}
          >
            <div className="flex-1 min-w-0 pr-2">
              <p className="font-semibold text-base truncate">{product.name}</p>
              <p className="text-sm text-muted-foreground">
                {CATEGORY_LABELS[product.category]} • R$ {product.price.toFixed(2)}
                {!product.active && <span className="text-destructive font-medium ml-1">• OFF</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <Switch
                  checked={product.active}
                  onCheckedChange={() => handleToggleActive(product.id, !!product.active)}
                />
                <span className={`text-[9px] font-bold uppercase ${product.active ? "text-primary" : "text-muted-foreground"}`}>
                  {product.active ? "NO MENU" : "FORA"}
                </span>
              </div>
              <div className="flex items-center gap-2 border-l border-border pl-3">
                <button
                  onClick={() => handleEdit(product)}
                  className="p-2 rounded-lg bg-secondary text-foreground active:scale-90 transition-transform"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(product.id)}
                  className="p-2 rounded-lg bg-destructive/20 text-destructive active:scale-90 transition-transform"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Admin;
