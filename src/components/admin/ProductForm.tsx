import { useState, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Product, CATEGORY_LABELS, CATEGORIES } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import {
  useProductGroups,
  useInvalidateProductGroups,
  addProductToGroup,
  createGroup,
  norm,
} from "@/lib/product-groups";
import { Input } from "@/components/ui/input";
import ProductRecipesPanel from "./ProductRecipesPanel";

interface Props {
  product: Product | null;
  onBack: () => void;
  onSaved: () => void;
  /** Categoria pré-selecionada ao criar novo produto. */
  initialCategory?: string;
}

const ProductForm = ({ product, onBack, onSaved, initialCategory }: Props) => {
  const [name, setName] = useState(product?.name || "");
  const [price, setPrice] = useState(product?.price?.toString() || "");
  const [category, setCategory] = useState(product?.category || initialCategory || "espetos");
  const [active, setActive] = useState(product?.active ?? true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const { data: groups = [] } = useProductGroups();
  const invalidateGroups = useInvalidateProductGroups();

  // Group selection: '' = none, '__new__' = create, otherwise group id
  const initialGroupId = useMemo(() => {
    if (!product) return "";
    const g = groups.find(
      (g) =>
        g.category === product.category &&
        g.member_names.some((m) => norm(m) === norm(product.name))
    );
    return g?.id ?? "";
  }, [product, groups]);
  const [groupId, setGroupId] = useState<string>(initialGroupId);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("📦");
  const [newGroupIsTrigger, setNewGroupIsTrigger] = useState(true);

  // Sync groupId once data loads (initialGroupId is memoized)
  useMemo(() => setGroupId(initialGroupId), [initialGroupId]);

  const groupsInCategory = groups.filter((g) => g.category === category);

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

      // Group handling
      if (groupId === "__new__" && newGroupName.trim()) {
        const triggerName = newGroupIsTrigger ? data.name : data.name;
        await createGroup({
          name: newGroupName.trim(),
          icon: newGroupIcon.trim() || "📦",
          category,
          trigger_product_name: triggerName,
          member_names: [data.name],
        });
        await invalidateGroups();
      } else if (groupId && groupId !== "__new__") {
        await addProductToGroup(groupId, data.name);
        await invalidateGroups();
      }

      toast({ title: product ? "Produto atualizado" : "Produto criado" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" });
      setSaving(false);
    }
  };

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
                onClick={() => {
                  setCategory(cat);
                  // Reset group if it doesn't belong to new category
                  const g = groups.find((g) => g.id === groupId);
                  if (g && g.category !== cat) setGroupId("");
                }}
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

        <div>
          <label className="text-sm font-semibold text-muted-foreground mb-1 block">
            Grupo / Popup (opcional)
          </label>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setGroupId("")}
              className={`rounded-lg border p-3 text-left text-sm font-semibold transition-all duration-150 active:scale-95 ${
                groupId === ""
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border bg-card text-foreground"
              }`}
            >
              <span className="block">Nenhum</span>
              <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
                Item normal — aparece direto na grade do PALM.
              </span>
            </button>

            {groupsInCategory.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroupId(g.id)}
                className={`rounded-lg border p-3 text-left text-sm font-semibold transition-all duration-150 active:scale-95 ${
                  groupId === g.id
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border bg-card text-foreground"
                }`}
              >
                <span className="block">
                  {g.icon} {g.name}
                </span>
                <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
                  Aparece dentro do popup ao tocar em "{g.trigger_product_name}".
                </span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setGroupId("__new__")}
              className={`rounded-lg border border-dashed p-3 text-left text-sm font-semibold transition-all duration-150 active:scale-95 ${
                groupId === "__new__"
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <span className="block">➕ Criar novo grupo…</span>
              <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
                Cria um grupo novo nesta categoria com este produto como primeiro membro.
              </span>
            </button>
          </div>

          {groupId === "__new__" && (
            <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="grid grid-cols-[70px_1fr] gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                    Ícone
                  </label>
                  <Input
                    value={newGroupIcon}
                    onChange={(e) => setNewGroupIcon(e.target.value)}
                    maxLength={4}
                    className="text-center text-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
                    Nome do grupo
                  </label>
                  <Input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Ex: Refri 350ml"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={newGroupIsTrigger}
                  onChange={(e) => setNewGroupIsTrigger(e.target.checked)}
                  className="h-4 w-4"
                />
                Este produto é o gatilho do grupo (aparece no card do PALM)
              </label>
            </div>
          )}
        </div>

        {product && category === "refeicoes" && (
          <ProductRecipesPanel productId={product.id} />
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
