import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Image as ImageIcon, Star, Eye, EyeOff, Ban } from "lucide-react";

type ProductOnline = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string | null;
  image_url: string | null;
  is_featured: boolean;
  is_available_online: boolean;
  is_sold_out: boolean;
  display_order: number;
  active: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  refeicoes: "Refeições",
  espetos: "Espetos",
  bebidas: "Bebidas",
  cervejas: "Cervejas",
};

async function fetchProducts(): Promise<ProductOnline[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, category, price, description, image_url, is_featured, is_available_online, is_sold_out, display_order, active")
    .eq("active", true)
    .order("category")
    .order("display_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as ProductOnline[];
}

type UpdateOnlinePatch = Partial<ProductOnline> & {
  clear_description?: boolean;
  clear_image_url?: boolean;
};

async function updateOnline(id: string, patch: UpdateOnlinePatch) {
  const { error } = await supabase.rpc("admin_update_product_online" as any, {
    p_id: id,
    p_description: patch.description ?? null,
    p_image_url: patch.image_url ?? null,
    p_is_featured: patch.is_featured ?? null,
    p_is_available_online: patch.is_available_online ?? null,
    p_is_sold_out: patch.is_sold_out ?? null,
    p_display_order: patch.display_order ?? null,
    p_clear_description: patch.clear_description ?? false,
    p_clear_image_url: patch.clear_image_url ?? false,
  });
  if (error) throw error;
}

export default function OnlineMenuTab() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin", "online-menu"],
    queryFn: fetchProducts,
  });
  const [editing, setEditing] = useState<ProductOnline | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "online-menu"] });

  const toggle = async (p: ProductOnline, field: "is_available_online" | "is_featured" | "is_sold_out") => {
    try {
      await updateOnline(p.id, { [field]: !p[field] } as any);
      toast.success("Atualizado");
      refresh();
    } catch (e) {
      toast.error("Erro ao atualizar");
    }
  };

  const grouped = products.reduce<Record<string, ProductOnline[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
        Aqui você controla apenas os campos do <strong>cardápio público online</strong>: foto,
        descrição, destaque, visibilidade online, esgotado e ordem. Preço, categoria e estoque
        continuam na aba <strong>Cardápio</strong>.
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <section key={cat}>
          <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABELS[cat] ?? cat}
          </h3>
          <div className="space-y-2">
            {items.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted"
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.description || "Sem descrição"}
                  </p>
                </div>
                <div className="hidden gap-2 sm:flex">
                  <button
                    type="button"
                    onClick={() => toggle(p, "is_featured")}
                    className={`rounded-md p-2 ${p.is_featured ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                    title="Destaque"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(p, "is_available_online")}
                    className={`rounded-md p-2 ${p.is_available_online ? "bg-emerald-500/15 text-emerald-500" : "text-muted-foreground hover:bg-muted"}`}
                    title="Visível online"
                  >
                    {p.is_available_online ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(p, "is_sold_out")}
                    className={`rounded-md p-2 ${p.is_sold_out ? "bg-rose-500/15 text-rose-500" : "text-muted-foreground hover:bg-muted"}`}
                    title="Esgotado"
                  >
                    <Ban className="h-4 w-4" />
                  </button>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                  Editar
                </Button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {editing && (
        <EditDialog
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  product,
  onClose,
  onSaved,
}: {
  product: ProductOnline;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(product.description ?? "");
  const [imageUrl, setImageUrl] = useState(product.image_url ?? "");
  const [isFeatured, setIsFeatured] = useState(product.is_featured);
  const [isAvailable, setIsAvailable] = useState(product.is_available_online);
  const [isSoldOut, setIsSoldOut] = useState(product.is_sold_out);
  const [displayOrder, setDisplayOrder] = useState(product.display_order);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${product.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      toast.success("Foto enviada");
    } catch (e: any) {
      toast.error("Erro ao enviar foto: " + (e.message ?? "?"));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmedDesc = description.trim();
      const trimmedImg = imageUrl.trim();
      await updateOnline(product.id, {
        description: trimmedDesc || undefined,
        image_url: trimmedImg || undefined,
        is_featured: isFeatured,
        is_available_online: isAvailable,
        is_sold_out: isSoldOut,
        display_order: displayOrder,
        clear_description: !trimmedDesc,
        clear_image_url: !trimmedImg,
      });
      toast.success("Salvo");
      onSaved();
    } catch (e: any) {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl bg-card p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-black">{product.name}</h3>
        <p className="text-xs text-muted-foreground">Cardápio online</p>

        <div className="mt-4 space-y-4">
          <div>
            <Label>Foto</Label>
            <div className="mt-1 flex gap-3">
              <div className="h-20 w-20 overflow-hidden rounded-md bg-muted">
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                />
                {imageUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setImageUrl("")}>
                    Remover foto
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Curta e gostosa de ler. Ex: Espeto suculento de picanha com farofa."
              rows={3}
              maxLength={300}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="feat">Destaque na home</Label>
            <Switch id="feat" checked={isFeatured} onCheckedChange={setIsFeatured} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="avail">Visível no cardápio online</Label>
            <Switch id="avail" checked={isAvailable} onCheckedChange={setIsAvailable} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sold">Esgotado</Label>
            <Switch id="sold" checked={isSoldOut} onCheckedChange={setIsSoldOut} />
          </div>
          <div>
            <Label>Ordem de exibição</Label>
            <Input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
