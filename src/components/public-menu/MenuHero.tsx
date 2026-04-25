import { Clock } from "lucide-react";
import { type Restaurant } from "@/lib/public-menu";

type Props = {
  restaurant: Restaurant;
  rightSlot?: React.ReactNode;
  title?: string | null;
  subtitle?: string | null;
  alignment?: "left" | "center";
  showLogo?: boolean;
  showOverlay?: boolean;
};

export default function MenuHero({
  restaurant,
  rightSlot,
  title,
  subtitle,
  alignment = "center",
  showLogo = true,
  showOverlay = true,
}: Props) {
  const prep = restaurant.default_prep_minutes ?? 0;
  const deliveryTotal = prep + ((restaurant as any).delivery_prep_buffer ?? 0);
  const displayTitle = title?.trim() || restaurant.name;
  const displaySub = subtitle?.trim() || restaurant.description || "";
  const isCenter = alignment === "center";

  return (
    <header className="relative">
      <div
        className="relative h-40 w-full bg-gradient-to-br from-primary/30 via-background to-background sm:h-56"
        style={
          restaurant.hero_url
            ? { backgroundImage: `url(${restaurant.hero_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
        aria-hidden
      >
        {showOverlay && restaurant.hero_url && (
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/30 to-transparent" />
        )}
      </div>
      <div className="mx-auto max-w-3xl px-4">
        <div className={`-mt-10 flex items-end gap-4 ${isCenter ? "sm:justify-center sm:text-center" : ""}`}>
          {showLogo && (
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-card shadow-lg sm:h-24 sm:w-24">
              {restaurant.logo_url ? (
                <img src={restaurant.logo_url} alt={restaurant.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary text-2xl font-black text-primary-foreground">
                  {restaurant.name.charAt(0)}
                </div>
              )}
            </div>
          )}
          <div className={`min-w-0 flex-1 pb-1 ${isCenter ? "sm:text-center" : ""}`}>
            <h1 className="truncate text-2xl font-black leading-tight sm:text-3xl">{displayTitle}</h1>
            {displaySub && (
              <p className="line-clamp-2 text-sm text-muted-foreground">{displaySub}</p>
            )}
          </div>
        </div>
        {prep > 0 && (
          <div className={`mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground ${isCenter ? "sm:justify-center" : ""}`}>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <Clock size={12} aria-hidden /> Preparo ~{prep} min
            </span>
            {deliveryTotal > prep && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                <Clock size={12} aria-hidden /> Entrega ~{deliveryTotal} min
              </span>
            )}
          </div>
        )}
        {rightSlot && <div className={`mt-3 ${isCenter ? "sm:flex sm:justify-center" : ""}`}>{rightSlot}</div>}
      </div>
    </header>
  );
}
