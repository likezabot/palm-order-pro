import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchRestaurantBySlug,
  fetchBusinessHours,
  fetchMenuCategories,
  fetchPublicProducts,
  fetchPublicMenuSettings,
  isRestaurantOpen,
  hexToHslString,
  type PublicProduct,
} from "@/lib/public-menu";
import { usePublicCart } from "@/lib/public-cart";
import { usePreviewMode } from "@/hooks/use-preview-mode";
import { toast } from "sonner";
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

  const products = productsQuery.data ?? [];
  const settings = settingsQuery.data;
  const isOpen = !!openQuery.data;

  // Aplica accent_color via CSS variable (escopado a esta página)
  useEffect(() => {
    const hsl = settings?.accent_color ? hexToHslString(settings.accent_color) : null;
    if (hsl) {
      const root = document.documentElement;
      const prev = root.style.getPropertyValue("--primary");
      root.style.setProperty("--primary", hsl);
      return () => {
        if (prev) root.style.setProperty("--primary", prev);
        else root.style.removeProperty("--primary");
      };
    }
  }, [settings?.accent_color]);

  const allCategories = categoriesQuery.data ?? [];

  // Aplica ordem custom + oculta categorias conforme settings
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

  const productsByCategory = useMemo(() => {
    const map = new Map<string, PublicProduct[]>();
    for (const p of products) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return map;
  }, [products]);

  const featured = useMemo(
    () => products.filter((p) => p.is_featured && !p.is_sold_out),
    [products],
  );

  const hasUpsellSuggestion = useMemo(() => {
    const cartIds = new Set(cart.items.map((c) => c.product_id));
    return products.some(
      (p) => p.active && p.is_available_online && !p.is_sold_out && !cartIds.has(p.id),
    );
  }, [products, cart.items]);

  useEffect(() => {
    if (!activeCat && categories.length) setActiveCat(categories[0].slug);
  }, [activeCat, categories]);

  const layoutMode = settings?.layout_mode ?? "list";
  const featuredStyle = settings?.featured_style ?? "carousel";
  const showImages = settings?.show_product_images ?? true;
  const showDescriptions = settings?.show_descriptions ?? true;
  const imageAspect = settings?.image_aspect ?? "square";

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

  // Restaurant com banner override (somente visual)
  const restaurant = settings?.banner_url
    ? { ...restaurantQuery.data, hero_url: settings.banner_url }
    : restaurantQuery.data;

  return (
    <PublicMenuLayout>
      {isPreview && (
        <div className="sticky top-0 z-50 bg-amber-500/90 px-4 py-2 text-center text-xs font-bold text-amber-950 backdrop-blur">
          Modo preview — pedidos desativados
        </div>
      )}

      <MenuHero
        restaurant={restaurant}
        rightSlot={<OpenStatusBadge open={isOpen} onClick={() => setHoursOpen(true)} />}
      />

      <div className="mx-auto max-w-3xl px-4">
        {settings?.welcome_message && (
          <p className="mt-3 rounded-lg border border-border bg-card p-3 text-sm text-foreground">
            {settings.welcome_message}
          </p>
        )}

        {!isOpen && !isPreview && (
          <div className="mt-4">
            <ClosedOverlay />
          </div>
        )}

        {featuredStyle !== "hidden" && (
          <FeaturedCarousel products={featured} variant={featuredStyle} />
        )}

        <CategoryNav
          categories={categories}
          activeSlug={activeCat}
          onSelect={(s) => {
            setActiveCat(s);
            const el = document.getElementById(`cat-${s}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />

        <div className="mt-4 space-y-8">
          {categories.map((cat) => {
            const items = (productsByCategory.get(cat.slug) ?? []).sort(
              (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name),
            );
            if (!items.length) return null;
            return (
              <section key={cat.id} id={`cat-${cat.slug}`} className="scroll-mt-20">
                <h2 className="mb-2 text-lg font-black uppercase tracking-wide">{cat.name}</h2>
                <div
                  className={
                    layoutMode === "grid"
                      ? "grid grid-cols-2 gap-3 sm:grid-cols-3"
                      : "grid grid-cols-1 gap-3"
                  }
                >
                  {items.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      disabled={!isOpen && !isPreview}
                      layout={layoutMode}
                      showImage={showImages}
                      showDescription={showDescriptions}
                      imageAspect={imageAspect}
                      onClick={(prod) => setSelected(prod)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

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

      {!isPreview && (
        <WhatsAppFab
          phone={restaurantQuery.data.whatsapp_phone}
          restaurantName={restaurantQuery.data.name}
        />
      )}
    </PublicMenuLayout>
  );
}
