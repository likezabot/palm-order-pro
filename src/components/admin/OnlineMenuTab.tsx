import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2,
  Image as ImageIcon,
  Star,
  Eye,
  EyeOff,
  Ban,
  Settings,
  Palette,
  Upload,
  Trash2,
  Camera,
  AlertCircle,
} from "lucide-react";
import OnlineSettingsPanel from "./OnlineSettingsPanel";
import PublicMenuCustomizer from "./PublicMenuCustomizer";

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
  is_sold_out_online: boolean;
  display_order: number;
  active: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  refeicoes: "Refeições",
  espetos: "Espetos",
  bebidas: "Bebidas",
  cervejas: "Cervejas",
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

async function fetchProducts(): Promise<ProductOnline[]> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, category, price, description, image_url, is_featured, is_available_online, is_sold_out, is_sold_out_online, display_order, active",
    )
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
    p_is_sold_out_online: patch.is_sold_out_online ?? null,
    p_display_order: patch.display_order ?? null,
    p_clear_description: patch.clear_description ?? false,
    p_clear_image_url: patch.clear_image_url ?? false,
  });
  if (error) throw error;
}

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Formato inválido. Use JPG, PNG ou WEBP.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Imagem muito grande. Máximo 5 MB.";
  }
  return null;
}

async function uploadProductImage(productId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${productId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

export default function OnlineMenuTab() {
  return (
    <Tabs defaultValue="menu" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="menu" className="font-bold">
          Cardápio
        </TabsTrigger>
        <TabsTrigger value="customize" className="font-bold gap-1.5">
          <Palette className="h-4 w-4" /> Personalizar
        </TabsTrigger>
        <TabsTrigger value="settings" className="font-bold gap-1.5">
          <Settings className="h-4 w-4" /> Configurações
        </TabsTrigger>
      </TabsList>
      <TabsContent value="menu">
        <OnlineMenuList />
      </TabsContent>
      <TabsContent value="customize">
        <PublicMenuCustomizer />
      </TabsContent>
      <TabsContent value="settings">
        <OnlineSettingsPanel />
      </TabsContent>
    </Tabs>
  );
}

function OnlineMenuList() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin", "online-menu"],
    queryFn: fetchProducts,
  });
  const [editing, setEditing] = useState<ProductOnline | null>(null);
  const [quickPhotoFor, setQuickPhotoFor] = useState<ProductOnline | null>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);
  const [quickUploading, setQuickUploading] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "online-menu"] });

  const toggle = async (
    p: ProductOnline,
    field: "is_available_online" | "is_featured" | "is_sold_out" | "is_sold_out_online",
  ) => {
    try {
      await updateOnline(p.id, { [field]: !p[field] } as any);
      toast.success("Atualizado");
      refresh();
    } catch {
      toast.error("Erro ao atualizar");
    }
  };

  const handleQuickPhoto = async (file: File) => {
    if (!quickPhotoFor) return;
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setQuickUploading(true);
    try {
      const url = await uploadProductImage(quickPhotoFor.id, file);
      await updateOnline(quickPhotoFor.id, { image_url: url });
      toast.success("Foto atualizada");
      setQuickPhotoFor(null);
      refresh();
    } catch (e: any) {
      toast.error("Erro ao enviar foto: " + (e?.message ?? "?"));
    } finally {
      setQuickUploading(false);
      if (quickInputRef.current) quickInputRef.current.value = "";
    }
  };

  const triggerQuickPhoto = (p: ProductOnline) => {
    setQuickPhotoFor(p);
    setTimeout(() => quickInputRef.current?.click(), 0);
  };

  const grouped = products.reduce<Record<string, ProductOnline[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  const totalProducts = products.length;
  const withoutPhoto = products.filter((p) => !p.image_url).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <input
        ref={quickInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleQuickPhoto(f);
        }}
      />

      <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
        Aqui você controla apenas os campos do <strong>cardápio público online</strong>: foto,
        descrição, destaque, visibilidade online, esgotado e ordem. Preço, categoria e estoque
        continuam na aba <strong>Cardápio</strong>.
      </div>

      {withoutPhoto > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold text-amber-700 dark:text-amber-400">
              {withoutPhoto} de {totalProducts} produto(s) sem foto
            </p>
            <p className="text-xs text-muted-foreground">
              Produtos sem foto aparecem com placeholder no cardápio público.
            </p>
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <section key={cat}>
          <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABELS[cat] ?? cat}
          </h3>
          <div className="space-y-2">
            {items.map((p) => {
              const noPhoto = !p.image_url;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-lg border bg-card p-3 transition ${
                    noPhoto ? "border-amber-500/40" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => triggerQuickPhoto(p)}
                    disabled={quickUploading}
                    className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border"
                    title={noPhoto ? "Adicionar foto" : "Trocar foto"}
                  >
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center text-amber-600">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="absolute inset-0 hidden items-center justify-center bg-black/50 text-white group-hover:flex">
                      {quickUploading && quickPhotoFor?.id === p.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Camera className="h-5 w-5" />
                      )}
                    </div>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate font-bold">{p.name}</p>
                      {noPhoto && (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                          Sem foto
                        </span>
                      )}
                      {p.is_featured && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                          Destaque
                        </span>
                      )}
                      {p.is_sold_out && (
                        <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600">
                          Esgotado salão
                        </span>
                      )}
                      {p.is_sold_out_online && (
                        <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600">
                          Esgotado online
                        </span>
                      )}
                      {!p.is_available_online && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          Oculto
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatPrice(p.price)} · {p.description || "Sem descrição"}
                    </p>
                  </div>
                  <div className="hidden gap-2 sm:flex">
                    <button
                      type="button"
                      onClick={() => triggerQuickPhoto(p)}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                      title="Editar foto"
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(p, "is_featured")}
                      className={`rounded-md p-2 ${
                        p.is_featured
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                      title="Destaque"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(p, "is_available_online")}
                      className={`rounded-md p-2 ${
                        p.is_available_online
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                      title="Visível online"
                    >
                      {p.is_available_online ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(p, "is_sold_out")}
                      className={`rounded-md p-2 ${
                        p.is_sold_out
                          ? "bg-rose-500/15 text-rose-500"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                      title="Esgotado"
                    >
                      <Ban className="h-4 w-4" />
                    </button>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                    Editar
                  </Button>
                </div>
              );
            })}
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
  const [isSoldOutOnline, setIsSoldOutOnline] = useState(product.is_sold_out_online);
  const [displayOrder, setDisplayOrder] = useState(product.display_order);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadProductImage(product.id, file);
      setImageUrl(url);
      toast.success("Foto enviada");
    } catch (e: any) {
      toast.error("Erro ao enviar foto: " + (e?.message ?? "?"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = () => {
    setImageUrl("");
    toast("Foto removida — clique em Salvar para confirmar.");
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
        is_sold_out_online: isSoldOutOnline,
        display_order: displayOrder,
        clear_description: !trimmedDesc,
        clear_image_url: !trimmedImg,
      });
      toast.success("Salvo");
      onSaved();
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-black">{product.name}</h3>
        <p className="text-xs text-muted-foreground">
          {formatPrice(product.price)} · Cardápio online
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <Label>Foto principal</Label>
            <div className="mt-1.5 flex flex-col gap-3 sm:flex-row">
              <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border">
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-[10px] font-bold uppercase">Sem foto</span>
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1.5"
                >
                  <Upload className="h-4 w-4" />
                  {imageUrl ? "Trocar foto" : "Enviar foto"}
                </Button>
                {imageUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemovePhoto}
                    className="gap-1.5 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover foto
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground">
                  JPG, PNG ou WEBP, máx. 5 MB.
                </p>
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
            <p className="mt-1 text-[11px] text-muted-foreground">
              {description.length}/300
            </p>
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
              type="number" inputMode="decimal"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving || uploading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
