import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Product, CATEGORY_LABELS, CATEGORIES } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  PORCO_GROUP_NAMES,
  PORCO_EXTRA_NAMES_KEY,
  addPorcoExtraName,
  useExtraPorcoNames,
} from "@/lib/porco-group";

interface Props {
  product: Product | null;
  onBack: () => void;
  onSaved: () => void;
  /** Categoria pré-selecionada ao criar novo produto (usado pelo botão contextual da seção). */
  initialCategory?: string;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const isCanonicalPorcoName = (name: string) =>
  PORCO_GROUP_NAMES.some((n) => norm(n) === norm(name));

const ProductForm = ({ product, onBack, onSaved, initialCategory }: Props) => {
  const [name, setName] = useState(product?.name || "");
  const [price, setPrice] = useState(product?.price?.toString() || "");
  const [category, setCategory] = useState(product?.category || initialCategory || "espetos");
  const [active, setActive] = useState(product?.active ?? true);
  const { data: extraPorcoNames = [] } = useExtraPorcoNames();
  const initialIsPorcoGroup = product
    ? isCanonicalPorcoName(product.name) ||
      extraPorcoNames.some((n) => norm(n) === norm(product.name))
    : false;
  const [porcoGroup, setPorcoGroup] = useState(initialIsPorcoGroup);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

      // If user opted into the Porco group and the name is NOT canonical,
      // register it as an extra name in settings so the popup picks it up.
      if (
        porcoGroup &&
        category === "espetos" &&
        !isCanonicalPorcoName(data.name)
      ) {
        try {
          await addPorcoExtraName(data.name);
          await queryClient.invalidateQueries({
            queryKey: ["settings", PORCO_EXTRA_NAMES_KEY],
          });
        } catch (e) {
          console.error("Failed to register Porco group extra name", e);
        }
      }

      toast({ title: product ? "Produto atualizado" : "Produto criado" });
      onSaved();
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
      setSaving(false);
    }
  };

  const showPorcoGroupSelector = category === "espetos";

  return (
    <div className="min-h-screen-safe flex flex-col">
      <div className="border-b border-border p-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center gap-4">
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

        {showPorcoGroupSelector && (
          <div>
            <label className="text-sm font-semibold text-muted-foreground mb-1 block">
              Grupo / Popup (opcional)
            </label>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setPorcoGroup(false)}
                className={`rounded-lg border p-3 text-left text-sm font-semibold transition-all duration-150 active:scale-95 ${
                  !porcoGroup
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border bg-card text-foreground"
                }`}
              >
                <span className="block">Nenhum</span>
                <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
                  Item normal — aparece direto na grade do PALM.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPorcoGroup(true)}
                className={`rounded-lg border p-3 text-left text-sm font-semibold transition-all duration-150 active:scale-95 ${
                  porcoGroup
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border bg-card text-foreground"
                }`}
              >
                <span className="block">🐷 Grupo Porco</span>
                <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
                  Aparece dentro do popup ao tocar em "Porco" no PALM.
                </span>
              </button>
            </div>
            {porcoGroup && !isCanonicalPorcoName(name) && name.trim() && (
              <p className="text-[11px] text-primary mt-2">
                "{name.trim()}" será adicionado como variante extra do popup do Porco.
              </p>
            )}
          </div>
        )}

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
