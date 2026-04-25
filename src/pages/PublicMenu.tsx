import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchRestaurantBySlug,
  fetchBusinessHours,
  fetchMenuCategories,
  fetchPublicProducts,
  isRestaurantOpen,
  type PublicProduct,
} from "@/lib/public-menu";
import { usePublicCart } from "@/lib/public-cart";
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
    staleTime: 30_000,
  });

  const openQuery = useQuery({
    queryKey: ["pmenu", "open", restaurantId],
    queryFn: () => isRestaurantOpen(restaurantId!),
    enabled: !!restaurantId,
    refetchInterval: 60_000,
  });

  const products = productsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const isOpen = !!openQuery.data;

  const productsByCategory = useMemo(() => {
    const map = new Map<string, PublicProduct[]>();
    for (const p of products) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return map;
  }, [products]);

  const featured = useMemo(() => products.filter((p) => p.is_featured && !p.is_sold_out), [products]);

  const hasUpsellSuggestion = useMemo(() => {
    const cartIds = new Set(cart.items.map((c) => c.product_id));
    return products.some(
      (p) => p.active && p.is_available_online && !p.is_sold_out && !cartIds.has(p.id),
    );
  }, [products, cart.items]);

  useEffect(() => {
    if (!activeCat && categories.length) setActiveCat(categories[0].slug);
  }, [activeCat, categories]);

  if (restaurantQuery.isLoading) {
    return (
      <PublicMenuLayout>
        <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">Carregando…</div>
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

  return (
    <PublicMenuLayout>
      <MenuHero
        restaurant={restaurantQuery.data}
        rightSlot={<OpenStatusBadge open={isOpen} onClick={() => setHoursOpen(true)} />}
      />

      <div className="mx-auto max-w-3xl px-4">
        {!isOpen && (
          <div className="mt-4">
            <ClosedOverlay />
          </div>
        )}

        <FeaturedCarousel products={featured} />

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
                <div className="grid grid-cols-1 gap-3">
                  {items.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      disabled={!isOpen}
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
        onAdd={(p, qty, note) => cart.add(p, qty, note)}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart.items}
        subtotal={cart.subtotal}
        onUpdateQty={cart.updateQty}
        onRemove={cart.remove}
        onCheckout={() => {
          setCartOpen(false);
          // Abre upsell antes do checkout; se não houver sugestão, vai direto
          setUpsellOpen(true);
        }}
      />

      <UpsellDialog
        open={upsellOpen}
        onOpenChange={setUpsellOpen}
        allProducts={products}
        cartItems={cart.items}
        onAdd={(p) => cart.add(p, 1, "")}
        onContinue={() => {
          setUpsellOpen(false);
          nav(`/menu/${slug}/checkout`);
        }}
      />

      {isOpen && (
        <PublicCartFab
          itemCount={cart.itemCount}
          total={cart.subtotal}
          onClick={() => setCartOpen(true)}
        />
      )}

      <WhatsAppFab
        phone={restaurantQuery.data.whatsapp_phone}
        restaurantName={restaurantQuery.data.name}
      />
    </PublicMenuLayout>
  );
}
