import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  fetchPublicMenuSettings,
  fetchMenuCategories,
  fetchCurrentRestaurant,
  isValidHex,
  isValidSlug,
  type PublicMenuSettings,
} from "@/lib/public-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  Copy,
  ExternalLink,
  Star,
  GripVertical,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
  Image as ImageIcon,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";



type UpdatePatch = Partial<PublicMenuSettings> & {
  clear_banner_url?: boolean;
  clear_welcome_message?: boolean;
  clear_hero_title?: boolean;
  clear_hero_subtitle?: boolean;
  clear_background_color?: boolean;
  clear_surface_color?: boolean;
  clear_text_color?: boolean;
  clear_muted_text_color?: boolean;
};

async function callUpdateSettings(restaurantId: string, patch: UpdatePatch) {
  const { error } = await supabase.rpc("admin_update_public_menu_settings" as any, {
    p_restaurant_id: restaurantId,
    p_layout_mode: patch.layout_mode ?? null,
    p_accent_color: patch.accent_color ?? null,
    p_banner_url: patch.banner_url ?? null,
    p_welcome_message: patch.welcome_message ?? null,
    p_show_descriptions: patch.show_descriptions ?? null,
    p_show_product_images: patch.show_product_images ?? null,
    p_featured_style: patch.featured_style ?? null,
    p_category_order: patch.category_order ?? null,
    p_hidden_category_slugs: patch.hidden_category_slugs ?? null,
    p_image_aspect: patch.image_aspect ?? null,
    p_clear_banner_url: patch.clear_banner_url ?? false,
    p_clear_welcome_message: patch.clear_welcome_message ?? false,
    p_hero_title: patch.hero_title ?? null,
    p_hero_subtitle: patch.hero_subtitle ?? null,
    p_hero_alignment: patch.hero_alignment ?? null,
    p_show_logo: patch.show_logo ?? null,
    p_show_open_status_badge: patch.show_open_status_badge ?? null,
    p_show_whatsapp_fab: patch.show_whatsapp_fab ?? null,
    p_show_search_bar: patch.show_search_bar ?? null,
    p_show_featured_section: patch.show_featured_section ?? null,
    p_show_category_nav: patch.show_category_nav ?? null,
    p_show_categories_section_title: patch.show_categories_section_title ?? null,
    p_categories_section_title: patch.categories_section_title ?? null,
    p_show_hero_banner_overlay: patch.show_hero_banner_overlay ?? null,
    p_show_welcome_message_card: patch.show_welcome_message_card ?? null,
    p_section_order: patch.section_order ?? null,
    p_background_color: patch.background_color ?? null,
    p_surface_color: patch.surface_color ?? null,
    p_text_color: patch.text_color ?? null,
    p_muted_text_color: patch.muted_text_color ?? null,
    p_button_style: patch.button_style ?? null,
    p_card_style: patch.card_style ?? null,
    p_radius_scale: patch.radius_scale ?? null,
    p_clear_hero_title: patch.clear_hero_title ?? false,
    p_clear_hero_subtitle: patch.clear_hero_subtitle ?? false,
    p_clear_background_color: patch.clear_background_color ?? false,
    p_clear_surface_color: patch.clear_surface_color ?? false,
    p_clear_text_color: patch.clear_text_color ?? false,
    p_clear_muted_text_color: patch.clear_muted_text_color ?? false,
  });
  if (error) throw error;
}

export default function PublicMenuCustomizer() {
  const qc = useQueryClient();
  const [slugInput, setSlugInput] = useState("");
  const [seeding, setSeeding] = useState(false);

  const restQuery = useQuery({
    queryKey: ["pmc", "restaurant", "current"],
    queryFn: () => fetchCurrentRestaurant(),
  });
  const restaurant = restQuery.data;

  useEffect(() => {
    if (restaurant?.slug) setSlugInput(restaurant.slug);
  }, [restaurant?.slug]);

  if (restQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!restaurant) {
    const seed = async () => {
      setSeeding(true);
      try {
        const { error } = await supabase
          .from("restaurants" as any)
          .insert({ name: "Meu Restaurante", slug: `restaurante-${Date.now().toString(36)}` });
        if (error) throw error;
        toast.success("Restaurante inicial criado");
        qc.invalidateQueries({ queryKey: ["pmc"] });
      } catch (e: any) {
        toast.error(e?.message ?? "Não foi possível criar o restaurante");
      } finally {
        setSeeding(false);
      }
    };
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm font-bold">Nenhum restaurante cadastrado</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Para personalizar o cardápio público, é preciso ter pelo menos um restaurante criado.
        </p>
        <Button className="mt-4" onClick={seed} disabled={seeding}>
          {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar restaurante inicial"}
        </Button>
      </div>
    );
  }

  const hasValidSlug = !!restaurant.slug && isValidSlug(restaurant.slug);

  return (
    <>
      {!hasValidSlug && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
          O slug deste restaurante está vazio ou inválido. Defina um slug válido em
          <strong> Link & QR Code </strong> abaixo para o link público funcionar.
        </div>
      )}
      <CustomizerInner
        restaurantId={restaurant.id}
        currentSlug={restaurant.slug ?? ""}
        slugInput={slugInput}
        setSlugInput={setSlugInput}
        onSlugSaved={() => {
          qc.invalidateQueries({ queryKey: ["pmc"] });
          qc.invalidateQueries({ queryKey: ["pmenu"] });
        }}
      />
    </>
  );
}

function CustomizerInner({
  restaurantId,
  currentSlug,
  slugInput,
  setSlugInput,
  onSlugSaved,
}: {
  restaurantId: string;
  currentSlug: string;
  slugInput: string;
  setSlugInput: (v: string) => void;
  onSlugSaved: () => void;
}) {
  const qc = useQueryClient();
  const [previewKey, setPreviewKey] = useState(0);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");

  const settingsQuery = useQuery({
    queryKey: ["pmc", "settings", restaurantId],
    queryFn: () => fetchPublicMenuSettings(restaurantId),
  });

  const categoriesQuery = useQuery({
    queryKey: ["pmc", "categories", restaurantId],
    queryFn: () => fetchMenuCategories(restaurantId),
  });

  const settings = settingsQuery.data;
  const categories = categoriesQuery.data ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pmc", "settings", restaurantId] });
    qc.invalidateQueries({ queryKey: ["pmenu"] });
    setPreviewKey((k) => k + 1);
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando configurações…
      </div>
    );
  }

  const publicUrl = `${window.location.origin}/menu/${currentSlug}`;
  const previewUrl = `${window.location.origin}/menu/${currentSlug}?preview=1`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
      {/* Painel de edição */}
      <div className="space-y-6">
        <LinkPanel
          publicUrl={publicUrl}
          currentSlug={currentSlug}
          slugInput={slugInput}
          setSlugInput={setSlugInput}
          restaurantId={restaurantId}
          onSlugSaved={onSlugSaved}
        />

        <Tabs defaultValue="visual" className="w-full">
          <TabsList className="flex-wrap">
            <TabsTrigger value="visual">Visual</TabsTrigger>
            <TabsTrigger value="hero">Home/Hero</TabsTrigger>
            <TabsTrigger value="secoes">Seções</TabsTrigger>
            <TabsTrigger value="paleta">Paleta</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
            <TabsTrigger value="categorias">Categorias</TabsTrigger>
            <TabsTrigger value="destaques">Destaques</TabsTrigger>
          </TabsList>

          <TabsContent value="visual">
            <VisualPanel
              restaurantId={restaurantId}
              settings={settings}
              onSaved={refresh}
            />
          </TabsContent>

          <TabsContent value="hero">
            <HeroPanel restaurantId={restaurantId} settings={settings} onSaved={refresh} />
          </TabsContent>

          <TabsContent value="secoes">
            <SectionsPanel restaurantId={restaurantId} settings={settings} onSaved={refresh} />
          </TabsContent>

          <TabsContent value="paleta">
            <PalettePanel restaurantId={restaurantId} settings={settings} onSaved={refresh} />
          </TabsContent>

          <TabsContent value="layout">
            <LayoutPanel
              restaurantId={restaurantId}
              settings={settings}
              onSaved={refresh}
            />
          </TabsContent>

          <TabsContent value="categorias">
            <CategoriesPanel
              restaurantId={restaurantId}
              settings={settings}
              categories={categories}
              onSaved={refresh}
            />
          </TabsContent>

          <TabsContent value="destaques">
            <FeaturedQuickPanel onChanged={refresh} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Preview */}
      <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <div className="flex items-center justify-between gap-2 pb-2">
          <p className="text-xs font-bold uppercase text-muted-foreground">Preview ao vivo</p>
          <div className="flex gap-1">
            <Button
              variant={device === "mobile" ? "default" : "outline"}
              size="sm"
              onClick={() => setDevice("mobile")}
            >
              <Smartphone className="h-4 w-4" />
            </Button>
            <Button
              variant={device === "desktop" ? "default" : "outline"}
              size="sm"
              onClick={() => setDevice("desktop")}
            >
              <Monitor className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreviewKey((k) => k + 1)}>
              Recarregar
            </Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <iframe
            key={previewKey}
            src={previewUrl}
            title="Preview do cardápio"
            className={
              device === "mobile"
                ? "mx-auto block h-[640px] w-[375px] max-w-full"
                : "block h-[640px] w-full"
            }
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-painéis
// ============================================================

function LinkPanel({
  publicUrl,
  currentSlug,
  slugInput,
  setSlugInput,
  restaurantId,
  onSlugSaved,
}: {
  publicUrl: string;
  currentSlug: string;
  slugInput: string;
  setSlugInput: (v: string) => void;
  restaurantId: string;
  onSlugSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const slugChanged = slugInput.trim() !== currentSlug;
  const valid = isValidSlug(slugInput.trim());

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(publicUrl)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copiado");
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  const saveSlug = async () => {
    if (!valid) {
      toast.error("Slug inválido");
      return;
    }
    if (
      !confirm(
        `Ao mudar o link, o endereço público antigo (${currentSlug}) deixa de funcionar. Continuar?`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_update_restaurant_slug" as any, {
        p_restaurant_id: restaurantId,
        p_new_slug: slugInput.trim(),
      });
      if (error) throw error;
      toast.success("Link atualizado");
      onSlugSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar slug");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-black uppercase tracking-wide text-muted-foreground">
        Link & QR Code
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">URL pública</Label>
            <div className="mt-1 flex gap-2">
              <Input value={publicUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copy}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Slug (parte editável da URL)</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value.toLowerCase())}
                placeholder="meu-restaurante"
              />
              <Button onClick={saveSlug} disabled={!slugChanged || !valid || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar slug"}
              </Button>
            </div>
            {slugInput && !valid && (
              <p className="mt-1 text-xs text-destructive">
                Use letras minúsculas, números e hífen (2-60 caracteres).
              </p>
            )}
            {slugChanged && valid && (
              <p className="mt-1 text-xs text-warning">
                Atenção: mudar o slug invalida o link público antigo.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <img
            src={qrUrl}
            alt="QR Code do cardápio"
            className="h-32 w-32 rounded-md border border-border bg-background p-2"
          />
          <a
            href={qrUrl}
            download="cardapio-qr.png"
            className="text-xs text-primary underline"
          >
            Baixar QR
          </a>
        </div>
      </div>
    </section>
  );
}

function VisualPanel({
  restaurantId,
  settings,
  onSaved,
}: {
  restaurantId: string;
  settings: PublicMenuSettings;
  onSaved: () => void;
}) {
  const [accent, setAccent] = useState(settings.accent_color);
  const [welcome, setWelcome] = useState(settings.welcome_message ?? "");
  const [bannerUrl, setBannerUrl] = useState(settings.banner_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAccent(settings.accent_color);
    setWelcome(settings.welcome_message ?? "");
    setBannerUrl(settings.banner_url ?? "");
  }, [settings]);

  const uploadBanner = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `banner-${restaurantId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setBannerUrl(data.publicUrl);
      toast.success("Banner enviado");
    } catch (e: any) {
      toast.error("Erro: " + (e?.message ?? "?"));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!isValidHex(accent)) {
      toast.error("Cor inválida (use #RRGGBB)");
      return;
    }
    setSaving(true);
    try {
      const trimmed = welcome.trim();
      const trimmedBanner = bannerUrl.trim();
      await callUpdateSettings(restaurantId, {
        accent_color: accent,
        welcome_message: trimmed || undefined,
        banner_url: trimmedBanner || undefined,
        clear_welcome_message: !trimmed,
        clear_banner_url: !trimmedBanner,
      });
      toast.success("Salvo");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <Label className="text-xs">Cor de destaque</Label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={isValidHex(accent) ? accent : "#E25822"}
            onChange={(e) => setAccent(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-md border border-border bg-background"
          />
          <Input
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            placeholder="#E25822"
            className="font-mono"
            maxLength={7}
          />
        </div>
        {!isValidHex(accent) && (
          <p className="mt-1 text-xs text-destructive">Use formato #RRGGBB ou #RGB.</p>
        )}
      </div>

      <div>
        <Label className="text-xs">Mensagem de boas-vindas</Label>
        <Textarea
          value={welcome}
          onChange={(e) => setWelcome(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Ex: Bem-vindo! Aproveite nosso cardápio."
        />
        <p className="mt-1 text-xs text-muted-foreground">{welcome.length}/500</p>
      </div>

      <div>
        <Label className="text-xs">Banner (capa do cardápio)</Label>
        <div className="mt-1 flex gap-3">
          <div className="h-20 w-32 overflow-hidden rounded-md bg-muted">
            {bannerUrl ? (
              <img src={bannerUrl} alt="Banner" className="h-full w-full object-cover" />
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
                if (f) uploadBanner(f);
              }}
            />
            {bannerUrl && (
              <Button variant="ghost" size="sm" onClick={() => setBannerUrl("")}>
                Remover banner
              </Button>
            )}
          </div>
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar identidade visual"}
      </Button>
    </section>
  );
}

function LayoutPanel({
  restaurantId,
  settings,
  onSaved,
}: {
  restaurantId: string;
  settings: PublicMenuSettings;
  onSaved: () => void;
}) {
  const [layout, setLayout] = useState<PublicMenuSettings["layout_mode"]>(settings.layout_mode);
  const [aspect, setAspect] = useState<PublicMenuSettings["image_aspect"]>(settings.image_aspect);
  const [featured, setFeatured] = useState<PublicMenuSettings["featured_style"]>(
    settings.featured_style,
  );
  const [showImg, setShowImg] = useState(settings.show_product_images);
  const [showDesc, setShowDesc] = useState(settings.show_descriptions);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLayout(settings.layout_mode);
    setAspect(settings.image_aspect);
    setFeatured(settings.featured_style);
    setShowImg(settings.show_product_images);
    setShowDesc(settings.show_descriptions);
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      await callUpdateSettings(restaurantId, {
        layout_mode: layout,
        image_aspect: aspect,
        featured_style: featured,
        show_product_images: showImg,
        show_descriptions: showDesc,
      });
      toast.success("Salvo");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <Label className="text-xs">Disposição dos produtos</Label>
        <Select value={layout} onValueChange={(v) => setLayout(v as any)}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="list">Lista (linhas)</SelectItem>
            <SelectItem value="grid">Grade (colunas)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Proporção das imagens</Label>
        <Select value={aspect} onValueChange={(v) => setAspect(v as any)}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="square">Quadrada (1:1)</SelectItem>
            <SelectItem value="wide">Larga (16:9)</SelectItem>
            <SelectItem value="tall">Alta (3:4)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Destaques</Label>
        <Select value={featured} onValueChange={(v) => setFeatured(v as any)}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="carousel">Carrossel horizontal</SelectItem>
            <SelectItem value="grid">Grade</SelectItem>
            <SelectItem value="hidden">Não exibir</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="show-img">Mostrar fotos dos produtos</Label>
        <Switch id="show-img" checked={showImg} onCheckedChange={setShowImg} />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="show-desc">Mostrar descrições</Label>
        <Switch id="show-desc" checked={showDesc} onCheckedChange={setShowDesc} />
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar layout"}
      </Button>
    </section>
  );
}

function CategoriesPanel({
  restaurantId,
  settings,
  categories,
  onSaved,
}: {
  restaurantId: string;
  settings: PublicMenuSettings;
  categories: { id: string; slug: string; name: string }[];
  onSaved: () => void;
}) {
  const initialOrder = useMemo(() => {
    const order = settings.category_order ?? [];
    const known = new Set(categories.map((c) => c.slug));
    const ordered = order.filter((s) => known.has(s));
    const remaining = categories.map((c) => c.slug).filter((s) => !ordered.includes(s));
    return [...ordered, ...remaining];
  }, [settings.category_order, categories]);

  const [orderState, setOrderState] = useState<string[]>(initialOrder);
  const [hidden, setHidden] = useState<string[]>(settings.hidden_category_slugs ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOrderState(initialOrder);
    setHidden(settings.hidden_category_slugs ?? []);
  }, [initialOrder, settings.hidden_category_slugs]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrderState((items) => {
      const oldIdx = items.indexOf(String(active.id));
      const newIdx = items.indexOf(String(over.id));
      return arrayMove(items, oldIdx, newIdx);
    });
  };

  const toggleHide = (slug: string) => {
    setHidden((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  const save = async () => {
    setSaving(true);
    try {
      await callUpdateSettings(restaurantId, {
        category_order: orderState,
        hidden_category_slugs: hidden,
      });
      toast.success("Salvo");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setSaving(false);
    }
  };

  const bySlug = useMemo(() => new Map(categories.map((c) => [c.slug, c])), [categories]);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        Arraste para reordenar. Use o olho para ocultar uma categoria do cardápio público.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={orderState} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {orderState.map((slug) => {
              const cat = bySlug.get(slug);
              if (!cat) return null;
              const isHidden = hidden.includes(slug);
              return (
                <SortableCatRow
                  key={slug}
                  slug={slug}
                  name={cat.name}
                  hidden={isHidden}
                  onToggle={() => toggleHide(slug)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar ordem"}
      </Button>
    </section>
  );
}

function SortableCatRow({
  slug,
  name,
  hidden,
  onToggle,
}: {
  slug: string;
  name: string;
  hidden: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slug,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground"
        {...attributes}
        {...listeners}
        aria-label="Arrastar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className={`flex-1 text-sm font-bold ${hidden ? "opacity-50 line-through" : ""}`}>
        {name}
      </span>
      <button
        type="button"
        onClick={onToggle}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted"
        aria-label={hidden ? "Mostrar" : "Ocultar"}
      >
        {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function FeaturedQuickPanel({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["pmc", "featured-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category, price, is_featured, image_url")
        .eq("active", true)
        .eq("is_available_online", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = async (id: string, current: boolean) => {
    try {
      const { error } = await supabase.rpc("admin_toggle_product_featured" as any, {
        p_product_id: id,
        p_is_featured: !current,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["pmc", "featured-products"] });
      qc.invalidateQueries({ queryKey: ["pmenu", "products"] });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        Toque na estrela para destacar (somente esse campo é alterado).
      </p>
      <div className="max-h-[480px] space-y-1 overflow-y-auto">
        {products.map((p: any) => (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id, p.is_featured)}
            className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-2 text-left transition-colors hover:border-primary/40"
          >
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
              {p.image_url ? (
                <img src={p.image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs">🍢</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">{p.category}</p>
            </div>
            <Star
              className={`h-5 w-5 ${p.is_featured ? "fill-primary text-primary" : "text-muted-foreground"}`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
