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
      {/* Hero — altura confortável e fade suave para o conteúdo */}
      <div
        className="relative h-36 w-full bg-gradient-to-br from-primary/20 via-background to-background sm:h-52"
        style={
          restaurant.hero_url
            ? { backgroundImage: `url(${restaurant.hero_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
        aria-hidden
      >
        {/* Overlay sutil para legibilidade quando há imagem */}
        {showOverlay && restaurant.hero_url && (
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-background/10" />
        )}
        {/* Fade final que conecta o hero ao fundo da página, sem corte visível */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
      </div>
      <div className="mx-auto max-w-3xl px-4">
        <div className={`-mt-6 flex items-center gap-3 ${isCenter ? "sm:justify-center sm:text-center" : ""}`}>
          {showLogo && (
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl ring-2 ring-background bg-card shadow-md sm:h-16 sm:w-16">
              {restaurant.logo_url ? (
                <img src={restaurant.logo_url} alt={restaurant.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary text-lg font-black text-primary-foreground">
                  {restaurant.name.charAt(0)}
                </div>
              )}
            </div>
          )}
          <div className={`min-w-0 flex-1 ${isCenter ? "sm:text-center" : ""}`}>
            <h1 className="truncate text-xl font-black leading-tight sm:text-2xl">{displayTitle}</h1>
            {displaySub && (
              <p className="line-clamp-1 text-xs sm:text-sm text-muted-foreground">{displaySub}</p>
            )}
          </div>
          {rightSlot && !isCenter && (
            <div className="shrink-0">{rightSlot}</div>
          )}
        </div>
        {(prep > 0 || (rightSlot && isCenter)) && (
          <div className={`mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground ${isCenter ? "sm:justify-center" : ""}`}>
            {prep > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                <Clock size={11} aria-hidden /> ~{prep} min
              </span>
            )}
            {deliveryTotal > prep && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                <Clock size={11} aria-hidden /> entrega ~{deliveryTotal} min
              </span>
            )}
            {rightSlot && isCenter && <div>{rightSlot}</div>}
          </div>
        )}
      </div>
    </header>
  );
}
