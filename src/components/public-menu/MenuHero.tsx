import { Clock } from "lucide-react";
import { type Restaurant } from "@/lib/public-menu";

type Props = {
  restaurant: Restaurant;
  rightSlot?: React.ReactNode;
};

export default function MenuHero({ restaurant, rightSlot }: Props) {
  const prep = restaurant.default_prep_minutes ?? 0;
  const deliveryTotal = prep + ((restaurant as any).delivery_prep_buffer ?? 0);
  return (
    <header className="relative">
      <div
        className="h-40 w-full bg-gradient-to-br from-primary/30 via-background to-background sm:h-56"
        style={
          restaurant.hero_url
            ? { backgroundImage: `url(${restaurant.hero_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
        aria-hidden
      />
      <div className="mx-auto max-w-3xl px-4">
        <div className="-mt-10 flex items-end gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-card shadow-lg sm:h-24 sm:w-24">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt={restaurant.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary text-2xl font-black text-primary-foreground">
                {restaurant.name.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate text-2xl font-black leading-tight sm:text-3xl">{restaurant.name}</h1>
            {restaurant.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">{restaurant.description}</p>
            )}
          </div>
        </div>
        {prep > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
        {rightSlot && <div className="mt-3">{rightSlot}</div>}
      </div>
    </header>
  );
}
