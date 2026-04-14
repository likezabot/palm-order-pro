import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { CartItem, Product, CATEGORY_LABELS, CATEGORIES } from "@/lib/types";

interface Props {
  onAdd: (product: Product) => void;
  cart: CartItem[];
  total: number;
  itemCount: number;
  onViewCart: () => void;
  onBack: () => void;
}

const MenuView = ({ onAdd, cart, total, itemCount, onViewCart, onBack }: Props) => {
  const [activeCategory, setActiveCategory] = useState<string>("espetos");

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const filtered = products.filter((p) => p.category === activeCategory);

  const getQty = (id: string) => cart.find((i) => i.product.id === id)?.quantity || 0;

  return (
    <div className="flex min-h-screen flex-col pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-3">
        <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground text-base mb-2">
          <ArrowLeft size={20} /> Voltar
        </button>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-150 ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground border border-border"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Products grid */}
      <div className="grid grid-cols-2 gap-3 p-3">
        {filtered.map((product) => {
          const qty = getQty(product.id);
          return (
            <button
              key={product.id}
              onClick={() => onAdd(product)}
              className="relative flex flex-col rounded-lg bg-card border border-border p-4 text-left transition-all duration-150 active:scale-[0.96]"
            >
              <span className="font-semibold text-base text-foreground leading-tight">
                {product.name}
              </span>
              <span className="mt-1 text-sm text-primary font-bold">
                R$ {product.price.toFixed(2)}
              </span>
              <span className="mt-2 text-sm font-semibold text-primary">+ ADD</span>
              {qty > 0 && (
                <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {qty}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Floating cart button */}
      {itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-background/90 backdrop-blur border-t border-border">
          <button
            onClick={onViewCart}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-primary p-4 text-lg font-bold text-primary-foreground active:scale-[0.97] transition-transform duration-150 min-h-[56px]"
          >
            <ShoppingCart size={22} />
            VER PEDIDO — {itemCount} {itemCount === 1 ? "item" : "itens"} — R$ {total.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
};

export default MenuView;
