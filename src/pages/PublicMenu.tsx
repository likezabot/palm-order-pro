import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchRestaurantBySlug,
  fetchBusinessHours,
  fetchMenuCategories,
  fetchPublicProducts,
  fetchPublicMenuSettings,
  fetchTopSellerProductIds,
  isRestaurantOpen,
  hexToHslString,
  type PublicProduct,
  type SectionKey,
} from "@/lib/public-menu";
import { usePublicCart } from "@/lib/public-cart";
import { usePreviewMode } from "@/hooks/use-preview-mode";
import { toast } from "sonner";
import { Search } from "lucide-react";
import PublicMenuLayout from "@/components/public-menu/PublicMenuLayout";
import MenuHero from "@/components/public-menu/MenuHero";
import OpenStatusBadge from "@/components/public-menu/OpenStatusBadge";
import HoursDialog from "@/components/public-menu/HoursDialog";
import CategoryNav from "@/components/public-menu/CategoryNav";
import ProductCard from "@/components/public-menu/ProductCard";
import FeaturedCarousel from "@/components/public-menu/FeaturedCarousel";
import ClosedOverlay from "@/components/public-menu/ClosedOverlay";
import ProductDetailSheet from "@/components/public-menu/ProductDetailSheet";
import PublicCartFab from "@/components/public-menu/PublicCartFab";
import CartDrawer from "@/components/public-menu/CartDrawer";
import UpsellDialog from "@/components/public-menu/UpsellDialog";
import WhatsAppFab from "@/components/public-menu/WhatsAppFab";
import TopSellersSection from "@/components/public-menu/TopSellersSection";

const RADIUS_MAP = { md: "0.5rem", lg: "0.75rem", xl: "1rem" } as const;

export default function PublicMenu() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const cart = usePublicCart();
  const isPreview = usePreviewMode();
  const [hoursOpen, setHoursOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [selected, setSelected] = useState<PublicProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [search, setSearch] = useState("");

  const restaurantQuery = useQuery({
    queryKey: ["pmenu", "restaurant", slug],
    queryFn: () => fetchRestaurantBySlug(slug ?? ""),
    enabled: !!slug,
    staleTime: 60_000,
  });

  const restaurantId = restaurantQuery.data?.id;

  const settingsQuery = useQuery({
    queryKey: ["pmenu", "settings", restaurantId],
    queryFn: () => fetchPublicMenuSettings(restaurantId!),
    enabled: !!restaurantId,
    staleTime: isPreview ? 0 : 30_000,
    refetchInterval: isPreview ? 2_000 : false,
  });

  const hoursQuery = useQuery({
    queryKey: ["pmenu", "hours", restaurantId],
    queryFn: () => fetchBusinessHours(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });

  const categoriesQuery = useQuery({
    queryKey: ["pmenu", "categories", restaurantId],
    queryFn: () => fetchMenuCategories(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });

  const productsQuery = useQuery({
    queryKey: ["pmenu", "products"],
    queryFn: fetchPublicProducts,
    staleTime: isPreview ? 0 : 30_000,
    refetchInterval: isPreview ? 3_000 : false,
  });

  const openQuery = useQuery({
    queryKey: ["pmenu", "open", restaurantId],
    queryFn: () => isRestaurantOpen(restaurantId!),
    enabled: !!restaurantId,
    refetchInterval: 60_000,
  });

  const topSellersQuery = useQuery({
    queryKey: ["pmenu", "top-sellers"],
    queryFn: () => fetchTopSellerProductIds(7),
    staleTime: 5 * 60_000,
  });

  const products = productsQuery.data ?? [];
  const settings = settingsQuery.data;
  const isOpen = !!openQuery.data;

  // Aplica paleta + radius via CSS variables (escopado a esta página via cleanup)
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const prev: Record<string, string> = {};
    const apply = (key: string, hex: string | null | undefined) => {
      if (!hex) return;
      const hsl = hexToHslString(hex);
      if (!hsl) return;
      prev[key] = root.style.getPropertyValue(key);
      root.style.setProperty(key, hsl);
    };
    apply("--primary", settings.accent_color);
    apply("--background", settings.background_color);
    apply("--card", settings.surface_color);
    apply("--popover", settings.surface_color);
    apply("--foreground", settings.text_color);
    apply("--card-foreground", settings.text_color);
    apply("--muted-foreground", settings.muted_text_color);

    const radius = RADIUS_MAP[settings.radius_scale] ?? "0.75rem";
    prev["--radius"] = root.style.getPropertyValue("--radius");
    root.style.setProperty("--radius", radius);

    return () => {
      for (const [k, v] of Object.entries(prev)) {
        if (v) root.style.setProperty(k, v);
        else root.style.removeProperty(k);
      }
    };
  }, [
    settings?.accent_color,
    settings?.background_color,
    settings?.surface_color,
    settings?.text_color,
    settings?.muted_text_color,
    settings?.radius_scale,
    settings,
  ]);

  const allCategories = categoriesQuery.data ?? [];

  const categories = useMemo(() => {
    const hidden = new Set(settings?.hidden_category_slugs ?? []);
    const visible = allCategories.filter((c) => !hidden.has(c.slug));
    const order = settings?.category_order ?? [];
    if (!order.length) return visible;
    const indexOf = (s: string) => {
      const i = order.indexOf(s);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...visible].sort((a, b) => indexOf(a.slug) - indexOf(b.slug));
  }, [allCategories, settings?.category_order, settings?.hidden_category_slugs]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const productsByCategory = useMemo(() => {
    const map = new Map<string, PublicProduct[]>();
    for (const p of filteredProducts) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return map;
  }, [filteredProducts]);

  const featured = useMemo(
    () => products.filter((p) => p.is_featured && !p.is_sold_out),
    [products],
  );

  const topSellers = useMemo(() => {
    const ids = topSellersQuery.data ?? [];
    if (!ids.length) return [];
    const byId = new Map(products.map((p) => [p.id, p]));
    const ordered: PublicProduct[] = [];
    for (const id of ids) {
      const p = byId.get(id);
      if (p && !p.is_sold_out) ordered.push(p);
      if (ordered.length >= 10) break;
    }
    return ordered;
  }, [topSellersQuery.data, products]);

  // Agrupa toasts de quickAdd: usa um id fixo (sonner sobrescreve em vez de
  // empilhar) e janela de 1.2s. Múltiplos cliques rápidos geram UMA notificação
  // com contagem total ("3 itens adicionados") em vez de uma por item.
  const quickAddBatchRef = useRef<{
    count: number;
    lastName: string;
    timer: number | null;
  }>({ count: 0, lastName: "", timer: null });

  const quickAdd = (p: PublicProduct) => {
    if (isPreview) {
      toast.info("Modo preview: ações de pedido estão desativadas.", {
        id: "preview-disabled",
      });
      return;
    }
    cart.add(p, 1, "");

    const batch = quickAddBatchRef.current;
    batch.count += 1;
    batch.lastName = p.name;

    const message =
      batch.count === 1
        ? `${batch.lastName} adicionado`
        : `${batch.count} itens adicionados`;

    toast.success(message, {
      id: "quick-add-batch",
      duration: 1600,
      description: batch.count > 1 ? `Último: ${batch.lastName}` : undefined,
    });

    if (batch.timer) window.clearTimeout(batch.timer);
    batch.timer = window.setTimeout(() => {
      batch.count = 0;
      batch.lastName = "";
      batch.timer = null;
    }, 1500);
  };


  const hasUpsellSuggestion = useMemo(() => {
    const cartIds = new Set(cart.items.map((c) => c.product_id));
    return products.some(
      (p) => p.active && p.is_available_online && !p.is_sold_out && !cartIds.has(p.id),
    );
  }, [products, cart.items]);

  useEffect(() => {
    if (!activeCat && categories.length) setActiveCat(categories[0].slug);
  }, [activeCat, categories]);

  const blockIfPreview = (action: () => void) => {
    if (isPreview) {
      toast.info("Modo preview: ações de pedido estão desativadas.");
      return;
    }
    action();
  };

  if (restaurantQuery.isLoading) {
    return (
      <PublicMenuLayout>
        <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
          Carregando…
        </div>
      </PublicMenuLayout>
    );
  }
  if (!restaurantQuery.data) {
    return (
      <PublicMenuLayout>
        <div className="mx-auto mt-20 max-w-md px-4 text-center">
          <h1 className="text-xl font-bold">Cardápio não encontrado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Verifique o link ou tente novamente mais tarde.
          </p>
        </div>
      </PublicMenuLayout>
    );
  }

  const restaurant = settings?.banner_url
    ? { ...restaurantQuery.data, hero_url: settings.banner_url }
    : restaurantQuery.data;

  const layoutMode = settings?.layout_mode ?? "list";
  const featuredStyle = settings?.featured_style ?? "carousel";
  const showImages = settings?.show_product_images ?? true;
  const showDescriptions = settings?.show_descriptions ?? true;
  const imageAspect = settings?.image_aspect ?? "square";
  const cardElevated = (settings?.card_style ?? "elevated") === "elevated";

  const sectionOrder: SectionKey[] =
    settings?.section_order && settings.section_order.length
      ? settings.section_order
      : ["hero", "featured", "categories", "welcome"];

  const renderSection = (key: SectionKey) => {
    switch (key) {
      case "hero":
        return (
          <MenuHero
            key="hero"
            restaurant={restaurant}
            title={settings?.hero_title}
            subtitle={settings?.hero_subtitle}
            alignment={settings?.hero_alignment ?? "center"}
            showLogo={settings?.show_logo ?? true}
            showOverlay={settings?.show_hero_banner_overlay ?? true}
            rightSlot={
              (settings?.show_open_status_badge ?? true) ? (
                <OpenStatusBadge open={isOpen} onClick={() => setHoursOpen(true)} />
              ) : null
            }
          />
        );
      case "welcome":
        if (!(settings?.show_welcome_message_card ?? true)) return null;
        if (!settings?.welcome_message) return null;
        return (
          <div key="welcome" className="mx-auto max-w-3xl px-4">
            <p
              className={`mt-3 rounded-lg border border-border bg-card p-3 text-sm text-foreground ${
                cardElevated ? "shadow-sm" : ""
              }`}
            >
              {settings.welcome_message}
            </p>
          </div>
        );
      case "featured":
        if (!(settings?.show_featured_section ?? true)) return null;
        if (featuredStyle === "hidden") return null;
        return (
          <div key="featured" className="mx-auto max-w-3xl px-4">
            <FeaturedCarousel products={featured} variant={featuredStyle} />
            {topSellers.length > 0 && (
              <TopSellersSection
                products={topSellers}
                disabled={!isOpen && !isPreview}
                onSelect={(p) => setSelected(p)}
                onQuickAdd={quickAdd}
              />
            )}
          </div>
        );
      case "categories":
        return (
          <div key="categories" className="mx-auto max-w-3xl px-4">
            {(settings?.show_search_bar ?? true) && (
              <div className="mt-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar no cardápio…"
                    className="h-11 w-full rounded-full border border-border/70 bg-card pl-10 pr-4 text-sm font-medium shadow-[var(--shadow-soft)] outline-none transition-all placeholder:text-muted-foreground/70 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20"
                    aria-label="Buscar"
                  />
                </div>
              </div>
            )}

            {(settings?.show_category_nav ?? true) && (
              <CategoryNav
                categories={categories}
                activeSlug={activeCat}
                onSelect={(s) => {
                  setActiveCat(s);
                  const el = document.getElementById(`cat-${s}`);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            )}

            {(settings?.show_categories_section_title ?? true) && (
              <h2 className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
                {settings?.categories_section_title || "Categorias"}
              </h2>
            )}

            <div className="mt-2 space-y-8">
              {categories.map((cat) => {
                const items = (productsByCategory.get(cat.slug) ?? []).sort(
                  (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name),
                );
                if (!items.length) return null;

                // Resolve overrides por categoria (caem no padrão global se ausentes)
                const ov = settings?.category_overrides?.[cat.slug] ?? {};
                const catLayoutKey =
                  ov.layout ?? (layoutMode === "grid" ? "grid-2" : "list");
                const catAspect = ov.image_aspect ?? imageAspect;
                const catCardStyle = ov.card_style ?? "detailed";
                const productLayout: "list" | "grid" =
                  catLayoutKey === "list" ? "list" : "grid";
                const gridClass =
                  catLayoutKey === "grid-3"
                    ? "grid grid-cols-2 gap-3 sm:grid-cols-3"
                    : catLayoutKey === "grid-2"
                      ? "grid grid-cols-2 gap-3"
                      : "grid grid-cols-1 gap-3";

                return (
                  <section key={cat.id} id={`cat-${cat.slug}`} className="scroll-mt-20">
                    <h3 className="mb-2 text-lg font-black uppercase tracking-wide">{cat.name}</h3>
                    <div className={gridClass}>
                      {items.map((p) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          disabled={!isOpen && !isPreview}
                          layout={productLayout}
                          showImage={showImages}
                          showDescription={showDescriptions}
                          imageAspect={catAspect}
                          cardStyle={catCardStyle}
                          onClick={(prod) => setSelected(prod)}
                          onQuickAdd={quickAdd}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <PublicMenuLayout>
      {isPreview && (
        <div className="sticky top-0 z-50 bg-warning px-4 py-2 text-center text-xs font-bold text-warning-foreground backdrop-blur">
          Modo preview — pedidos desativados
        </div>
      )}

      {sectionOrder.map(renderSection)}

      {!isOpen && !isPreview && (
        <div className="mx-auto max-w-3xl px-4">
          <div className="mt-4">
            <ClosedOverlay />
          </div>
        </div>
      )}

      <HoursDialog open={hoursOpen} onOpenChange={setHoursOpen} hours={hoursQuery.data ?? []} />

      <ProductDetailSheet
        product={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onAdd={(p, qty, note) =>
          blockIfPreview(() => {
            cart.add(p, qty, note);
          })
        }
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart.items}
        subtotal={cart.subtotal}
        onUpdateQty={cart.updateQty}
        onRemove={cart.remove}
        onCheckout={() =>
          blockIfPreview(() => {
            setCartOpen(false);
            if (hasUpsellSuggestion) {
              setUpsellOpen(true);
            } else {
              nav(`/menu/${slug}/checkout`);
            }
          })
        }
      />

      <UpsellDialog
        open={upsellOpen}
        onOpenChange={setUpsellOpen}
        allProducts={products}
        cartItems={cart.items}
        onAdd={(p) => blockIfPreview(() => cart.add(p, 1, ""))}
        onContinue={() =>
          blockIfPreview(() => {
            setUpsellOpen(false);
            nav(`/menu/${slug}/checkout`);
          })
        }
      />

      {isOpen && !isPreview && (
        <PublicCartFab
          itemCount={cart.itemCount}
          total={cart.subtotal}
          onClick={() => setCartOpen(true)}
        />
      )}

      {!isPreview && (settings?.show_whatsapp_fab ?? true) && (
        <WhatsAppFab
          phone={restaurantQuery.data.whatsapp_phone}
          restaurantName={restaurantQuery.data.name}
        />
      )}
    </PublicMenuLayout>
  );
}
