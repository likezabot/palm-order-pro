import { useState, useMemo, KeyboardEvent } from "react";
import { ArrowLeft, X, Plus } from "lucide-react";
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

/** Normaliza apelido: lowercase, trim, remove acentos, colapsa espaços. */
function normalizeAlias(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

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
  const [imageUrl, setImageUrl] = useState(product?.image_url || "");
  const [description, setDescription] = useState(product?.description || "");
  const [isFeatured, setIsFeatured] = useState(product?.is_featured ?? false);
  const [isAvailableOnline, setIsAvailableOnline] = useState(product?.is_available_online ?? true);
  const [isSoldOut, setIsSoldOut] = useState(product?.is_sold_out ?? false);
  const [aliases, setAliases] = useState<string[]>(
    Array.isArray(product?.aliases) ? (product!.aliases as string[]) : []
  );
  const [aliasDraft, setAliasDraft] = useState("");
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

  // ── Apelidos ──────────────────────────────────────────────────────────────
  function addAliasFromDraft() {
    const cleaned = normalizeAlias(aliasDraft);
    if (!cleaned) return;
    if (cleaned === normalizeAlias(name)) {
      setAliasDraft("");
      return;
    }
    if (aliases.some((a) => normalizeAlias(a) === cleaned)) {
      setAliasDraft("");
      return;
    }
    setAliases([...aliases, cleaned]);
    setAliasDraft("");
  }
  function removeAlias(idx: number) {
    setAliases(aliases.filter((_, i) => i !== idx));
  }
  function handleAliasKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addAliasFromDraft();
    } else if (e.key === "Backspace" && !aliasDraft && aliases.length > 0) {
      setAliases(aliases.slice(0, -1));
    }
  }

  const handleSave = async () => {
    if (!name.trim() || !price || saving) return;
    setSaving(true);
    try {
      // Normaliza apelidos no submit (defensivo) e remove duplicatas / nome.
      const cleanName = name.trim();
      const cleanAliases = Array.from(
        new Set(
          [...aliases, aliasDraft]
            .map((a) => normalizeAlias(a))
            .filter((a) => a && a !== normalizeAlias(cleanName)),
        ),
      );

      const data = {
        name: cleanName,
        price: parseFloat(price),
        category,
        active,
        aliases: cleanAliases,
        image_url: imageUrl.trim() || null,
        description: description.trim() || null,
        is_featured: isFeatured,
        is_available_online: isAvailableOnline,
        is_sold_out: isSoldOut,
      };

      const { withPin } = await import("@/lib/manager-pin");
      const result = await withPin(async (pin) => {
        const { error } = await supabase.rpc("admin_upsert_product", {
          p_pin: pin,
          p_id: product?.id ?? null,
          p_name: data.name,
          p_price: data.price,
          p_category: data.category,
          p_active: data.active,
          p_aliases: data.aliases,
          p_unit: "unidade",
          p_image_url: data.image_url,
          p_description: data.description,
          p_is_featured: data.is_featured,
          p_is_available_online: data.is_available_online,
          p_is_sold_out: data.is_sold_out,
        });
        if (error) throw error;
      }, product ? "Editar produto" : "Criar produto");
      if (result === null) { setSaving(false); return; }

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
            type="number" inputMode="decimal"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-lg border border-border bg-card p-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-muted-foreground mb-1 block">Descrição (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-card p-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Ex: Refrescante, lata 350ml."
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-muted-foreground mb-1 block">URL da Imagem</label>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://exemplo.com/imagem.jpg"
                className="flex-1 rounded-lg border border-border bg-card p-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="rounded-lg bg-muted px-4 text-muted-foreground hover:bg-muted/80"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                // Heurística básica de sugestão baseada no nome
                const query = encodeURIComponent(name);
                toast({ 
                  title: "Sugestão de imagem", 
                  description: "Busque no Google e copie a URL da imagem desejada.",
                  action: (
                    <button 
                      onClick={() => window.open(`https://www.google.com/search?tbm=isch&q=${query}`, '_blank')}
                      className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded"
                    >
                      Abrir busca
                    </button>
                  )
                });
              }}
              className="text-xs font-semibold text-primary/80 hover:text-primary transition-colors flex items-center gap-1"
            >
              <Plus size={14} /> Sugerir imagem (Google)
            </button>

            {imageUrl && (
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className={category === "bebidas" || category === "cervejas" ? "h-full object-contain" : "h-full w-full object-cover"}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x225?text=Imagem+Inv%C3%A1lida";
                  }}
                />
              </div>
            )}
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

        {/* ── Apelidos / variações ─────────────────────────────────────── */}
        <div>
          <label className="text-sm font-semibold text-muted-foreground mb-1 block">
            Apelidos / variações
          </label>
          <div className="rounded-lg border border-border bg-card p-3">
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {aliases.map((a, i) => (
                  <span
                    key={`${a}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2.5 py-1 text-xs font-semibold"
                  >
                    {a}
                    <button
                      type="button"
                      onClick={() => removeAlias(i)}
                      className="hover:bg-primary/25 rounded-full p-0.5"
                      aria-label={`Remover ${a}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={aliasDraft}
                onChange={(e) => setAliasDraft(e.target.value)}
                onKeyDown={handleAliasKeyDown}
                placeholder="Ex.: coca zero, zero, ks zero"
                className="flex-1"
              />
              <button
                type="button"
                onClick={addAliasFromDraft}
                disabled={!aliasDraft.trim()}
                className="rounded-md bg-primary/15 text-primary px-3 font-semibold disabled:opacity-40 active:scale-95 transition-transform"
                aria-label="Adicionar apelido"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Como o garçom pode chamar este item por voz ou Telegram. Pressione Enter ou vírgula para adicionar.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-card border border-border p-4">
            <div>
              <span className="font-semibold block">Em destaque</span>
              <span className="text-[11px] text-muted-foreground">Exibe no topo do cardápio online</span>
            </div>
            <button
              onClick={() => setIsFeatured(!isFeatured)}
              className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
                isFeatured ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform duration-200 ${
                  isFeatured ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-card border border-border p-4">
            <div>
              <span className="font-semibold block">Disponível Online</span>
              <span className="text-[11px] text-muted-foreground">Oculta do cardápio público se desativado</span>
            </div>
            <button
              onClick={() => setIsAvailableOnline(!isAvailableOnline)}
              className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
                isAvailableOnline ? "bg-success" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform duration-200 ${
                  isAvailableOnline ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-card border border-border p-4">
            <div>
              <span className="font-semibold block">Esgotado</span>
              <span className="text-[11px] text-muted-foreground">Impede a compra no cardápio online</span>
            </div>
            <button
              onClick={() => setIsSoldOut(!isSoldOut)}
              className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
                isSoldOut ? "bg-destructive" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform duration-200 ${
                  isSoldOut ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-card border border-border p-4">
            <div>
              <span className="font-semibold block">Ativo (Geral)</span>
              <span className="text-[11px] text-muted-foreground">Ativa/Desativa o produto em todo o sistema</span>
            </div>
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
