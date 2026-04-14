import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Product, CATEGORY_LABELS, CATEGORIES } from "@/lib/types";
import ProductForm from "@/components/admin/ProductForm";
import { useToast } from "@/hooks/use-toast";

const Admin = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);

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
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-primary-foreground active:scale-95 transition-transform"
        >
          <Plus size={18} /> NOVO
        </button>
      </div>

      <div className="flex-1 p-4 space-y-2">
        {products.map((product) => (
          <div
            key={product.id}
            className={`flex items-center justify-between rounded-lg bg-card border border-border p-4 ${
              !product.active ? "opacity-50" : ""
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base truncate">{product.name}</p>
              <p className="text-sm text-muted-foreground">
                {CATEGORY_LABELS[product.category]} • R$ {product.price.toFixed(2)}
                {!product.active && " • Inativo"}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-3">
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
        ))}
      </div>
    </div>
  );
};

export default Admin;
