import { useEffect, useState } from "react";
import { Clock, Gift } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchLoyaltyEnabled } from "@/lib/loyalty";
import { type Restaurant } from "@/lib/public-menu";
import { cn } from "@/lib/utils";
import {
  contrastRatio,
  overlayAlphaForWhiteText,
  sampleImageLuminance,
} from "@/lib/wcag-contrast";
import {
  getCachedOverlayAlpha,
  setCachedOverlayAlpha,
} from "@/lib/hero-overlay-cache";

type Props = {
  restaurant: Restaurant;
  rightSlot?: React.ReactNode;
  title?: string | null;
  subtitle?: string | null;
  alignment?: "left" | "center";
  showLogo?: boolean;
  showOverlay?: boolean;
};

/**
 * Hero do cardápio público.
 */
export default function MenuHero({
  restaurant,
  rightSlot,
  title,
  subtitle,
  alignment = "center",
  showLogo = true,
  showOverlay = true,
}: Props) {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);

  useEffect(() => {
    fetchLoyaltyEnabled().then(setLoyaltyEnabled);
  }, []);

  const prep = restaurant.default_prep_minutes ?? 0;
  const deliveryTotal = prep + ((restaurant as any).delivery_prep_buffer ?? 0);
  const displayTitle = title?.trim() || restaurant.name;
  const displaySub = subtitle?.trim() || restaurant.description || "";
  const isCenter = alignment === "center";
  const hasHero = !!restaurant.hero_url;

  const [overlayAlpha, setOverlayAlpha] = useState<number>(() => {
    if (!hasHero) return 0.55;
    const cached = getCachedOverlayAlpha(restaurant.hero_url!);
    return cached ?? 0.55;
  });

  useEffect(() => {
    if (!hasHero) return;
    const url = restaurant.hero_url!;
    if (getCachedOverlayAlpha(url) != null) return;

    const ctrl = new AbortController();
    sampleImageLuminance(url, ctrl.signal).then((L) => {
      if (L == null) return;
      const alpha = overlayAlphaForWhiteText(L, 4.5, 0.3, 0.85);
      setOverlayAlpha(alpha);
      setCachedOverlayAlpha(url, alpha);
    });
    return () => ctrl.abort();
  }, [hasHero, restaurant.hero_url]);

  const titleShadow = hasHero
    ? { textShadow: "0 2px 12px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.45)" }
    : undefined;
  const subShadow = hasHero
    ? { textShadow: "0 1px 6px rgba(0,0,0,0.55)" }
    : undefined;

  return (
    <header className="relative">
      <div className="relative h-56 w-full overflow-hidden sm:h-72">
        <div
          className={cn(
            "absolute inset-0",
            !hasHero && "bg-gradient-to-br from-primary via-accent/40 to-primary/70",
          )}
          style={
            hasHero
              ? {
                  backgroundImage: `url(${restaurant.hero_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
          aria-hidden
        />

        {hasHero && showOverlay && (
          <>
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, hsl(14 78% 35% / 0.25) 0%, transparent 50%, hsl(15 26% 10% / 0.35) 100%)",
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 transition-opacity duration-500"
              style={{
                background: `linear-gradient(to bottom, rgba(0,0,0,${(overlayAlpha * 0.85).toFixed(3)}) 0%, rgba(0,0,0,${(overlayAlpha * 0.65).toFixed(3)}) 40%, rgba(0,0,0,${Math.min(0.95, overlayAlpha * 1.15).toFixed(3)}) 100%)`,
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)",
              }}
              aria-hidden
            />
          </>
        )}

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background via-background/70 to-transparent"
          aria-hidden
        />

        <div className="relative z-10 mx-auto flex h-full max-w-3xl items-end px-4 pb-16">
          <div className={cn("min-w-0 flex-1", isCenter && "text-center")}>
            <h1
              className="truncate text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl"
              style={titleShadow}
            >
              {displayTitle}
            </h1>
            {displaySub && (
              <p
                className="mt-1 line-clamp-1 text-sm font-medium text-white/95 sm:text-base"
                style={subShadow}
              >
                {displaySub}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4">
        <div
          className={cn(
            "-mt-12 flex items-center gap-3",
            isCenter && "sm:justify-center sm:text-center",
          )}
        >
          {showLogo && (
            <div
              className={cn(
                "relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-card sm:h-24 sm:w-24",
                "ring-[3px] ring-background",
              )}
              style={{
                boxShadow:
                  "0 0 0 1px hsl(36 78% 52% / 0.45), 0 14px 36px -10px hsl(14 76% 46% / 0.45), 0 4px 14px -2px hsl(18 50% 20% / 0.18)",
              }}
            >
              {restaurant.logo_url ? (
                <img
                  src={restaurant.logo_url}
                  alt={`Logo de ${restaurant.name}`}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary via-primary-glow to-accent text-2xl font-black text-primary-foreground">
                  {restaurant.name.charAt(0)}
                </div>
              )}
            </div>
          )}

          {loyaltyEnabled && slug && (
            <button
              onClick={() => nav(`/menu/${slug}/pontos`)}
              className={cn(
                "group relative mt-1 flex h-14 items-center gap-2 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-white/95 via-amber-50/90 to-amber-100/95 px-4 py-2 shadow-[0_8px_20px_-4px_rgba(245,158,11,0.25)] backdrop-blur-md transition-all hover:scale-[1.02] hover:border-amber-500/50 hover:shadow-[0_12px_24px_-4px_rgba(245,158,11,0.35)] active:scale-[0.98]",
                !isCenter && "ml-auto sm:ml-0"
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-white shadow-[0_2px_8px_rgba(217,119,6,0.4)]">
                <Gift size={18} className="drop-shadow-sm" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-amber-700/80">
                  Fidelidade
                </span>
                <span className="text-[13px] font-black leading-tight text-amber-900">
                  Meus Pontos
                </span>
              </div>
              <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
            </button>
          )}

          {rightSlot && !isCenter && (
            <div className="ml-auto shrink-0 self-end pb-1">{rightSlot}</div>
          )}
        </div>

        {(prep > 0 || rightSlot) && (
          <div
            className={cn(
              "mt-3 flex flex-wrap items-center gap-2 text-xs",
              isCenter && "sm:justify-center",
            )}
          >
            {prep > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 font-semibold text-foreground/80 shadow-[var(--shadow-soft)]"
                style={{ background: "var(--brand-gradient-soft)" }}
              >
                <Clock size={12} aria-hidden className="text-primary" /> ~{prep} min
              </span>
            )}
            {deliveryTotal > prep && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 font-semibold text-foreground/80 shadow-[var(--shadow-soft)]"
                style={{ background: "var(--brand-gradient-soft)" }}
              >
                <Clock size={12} aria-hidden className="text-primary" /> entrega ~{deliveryTotal} min
              </span>
            )}
            {rightSlot && isCenter && <div>{rightSlot}</div>}
          </div>
        )}
      </div>
    </header>
  );
}
