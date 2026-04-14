import { useState } from "react";
import { ArrowLeft, Package, Ruler } from "lucide-react";
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
  const [unit, setUnit] = useState(product?.unit || "unidade");
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
        unit,
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
    <div className="min-h-screen flex flex-col bg-[#1a1a1a]">
      <div className="border-b border-white/10 p-4 flex items-center gap-4 bg-[#1a1a1a] sticky top-0 z-10">
        <button onClick={onBack} className="text-white/60 p-2 hover:bg-white/5 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-black text-white tracking-tighter uppercase">{product ? "Editar Produto" : "Novo Produto"}</h1>
      </div>

      <div className="p-4 space-y-6 pb-10">
        <div className="space-y-2">
          <label className="text-xs font-black uppercase tracking-widest text-white/40 mb-1 block px-1">Nome do Produto</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#2a2a2a] p-4 text-base text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            placeholder="Ex: Espeto de Carne"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-white/40 mb-1 block px-1">Preço (R$)</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#2a2a2a] p-4 text-base text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-black"
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-white/40 mb-1 block px-1">Unidade</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#2a2a2a] p-4 text-base text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              placeholder="unidade, kg, etc."
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-black uppercase tracking-widest text-white/40 mb-1 block px-1">Categoria</label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-xl border p-4 text-xs font-black uppercase transition-all duration-150 active:scale-95 ${
                  category === cat
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-white/5 bg-[#2a2a2a] text-white/60"
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-[#2a2a2a] border border-white/5 p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${active ? "bg-emerald-500/10 text-emerald-500" : "bg-white/5 text-white/40"}`}>
              {active ? <Package size={20} /> : <Package size={20} className="grayscale" />}
            </div>
            <div>
              <span className="font-bold text-white block">Ativo no cardápio</span>
              <span className="text-[10px] text-white/40 font-black uppercase tracking-widest">Disponível para venda</span>
            </div>
          </div>
          <button
            onClick={() => setActive(!active)}
            className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
              active ? "bg-emerald-500" : "bg-[#333]"
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
          className="w-full rounded-xl bg-primary p-5 text-lg font-black text-primary-foreground active:scale-[0.97] transition-all disabled:opacity-40 min-h-[56px] uppercase tracking-widest shadow-lg shadow-primary/20"
        >
          {saving ? "SALVANDO..." : "SALVAR PRODUTO"}
        </button>
      </div>
    </div>
  );
};

export default ProductForm;
