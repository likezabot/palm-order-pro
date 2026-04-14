import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Product, CATEGORY_LABELS, CATEGORIES } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

interface Props {
  product: Product | null;
  onBack: () => void;
  onSaved: () => void;
}

const ProductForm = ({ product, onBack, onSaved }: Props) => {
  const [name, setName] = useState(product?.name || "");
  const [price, setPrice] = useState(product?.price?.toString() || "");
  const [category, setCategory] = useState(product?.category || "espetos");
  const [active, setActive] = useState(product?.active ?? true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!name.trim() || !price || saving) return;
    setSaving(true);

    try {
      const data = {
        name: name.trim(),
        price: parseFloat(price),
        category,
        active,
      };

      if (product) {
        await supabase.from("products").update(data).eq("id", product.id);
      } else {
        await supabase.from("products").insert(data);
      }

      toast({ title: product ? "Produto atualizado" : "Produto criado" });
      onSaved();
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="border-b border-border p-4 flex items-center gap-4">
        <button onClick={onBack} className="text-muted-foreground">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">{product ? "Editar Produto" : "Novo Produto"}</h1>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="text-sm font-semibold text-muted-foreground mb-1 block">Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border bg-card p-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-muted-foreground mb-1 block">Preço (R$)</label>
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-lg border border-border bg-card p-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-muted-foreground mb-1 block">Categoria</label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-lg border p-3 text-sm font-semibold transition-all duration-150 active:scale-95 ${
                  category === cat
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border bg-card text-foreground"
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-card border border-border p-4">
          <span className="font-semibold">Ativo no cardápio</span>
          <button
            onClick={() => setActive(!active)}
            className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
              active ? "bg-success" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform duration-200 ${
                active ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !price}
          className="w-full rounded-lg bg-primary p-4 text-lg font-bold text-primary-foreground active:scale-[0.97] transition-transform disabled:opacity-40 min-h-[56px]"
        >
          {saving ? "SALVANDO..." : "SALVAR"}
        </button>
      </div>
    </div>
  );
};

export default ProductForm;
