import { type PublicProduct } from "@/lib/public-menu";
import SoldOutBadge from "./SoldOutBadge";
import { cn } from "@/lib/utils";

type Props = {
  product: PublicProduct;
  disabled?: boolean;
  layout?: "list" | "grid";
  showImage?: boolean;
  showDescription?: boolean;
  imageAspect?: "square" | "wide" | "tall";
  onClick?: (p: PublicProduct) => void;
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ProductCard({
  product,
  disabled,
  layout = "list",
  showImage = true,
  showDescription = true,
  imageAspect = "square",
  onClick,
}: Props) {
  const isBlocked = disabled || product.is_sold_out;
  const interactive = !isBlocked && !!onClick;
  const Tag: any = interactive ? "button" : "article";

  const aspectClass =
    imageAspect === "wide"
      ? "aspect-[16/9]"
      : imageAspect === "tall"
        ? "aspect-[3/4]"
        : "aspect-square";

  if (layout === "grid") {
    return (
      <Tag
        type={interactive ? "button" : undefined}
        onClick={interactive ? () => onClick!(product) : undefined}
        className={cn(
          "flex w-full flex-col text-left overflow-hidden rounded-xl border border-border bg-card transition-colors",
          isBlocked
            ? "opacity-60 cursor-not-allowed"
            : "hover:border-primary/40 active:scale-[0.99]",
        )}
      >
        {showImage && (
          <div className={cn("w-full bg-muted", aspectClass)}>
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl">🍢</div>
            )}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col p-3">
          <div className="flex items-center gap-2">
            <h3 className="line-clamp-2 text-sm font-bold">{product.name}</h3>
            {product.is_sold_out && <SoldOutBadge />}
          </div>
          {showDescription && product.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
          )}
          <p className="mt-auto pt-2 text-base font-black text-primary">
            {formatBRL(product.price)}
          </p>
        </div>
      </Tag>
    );
  }

  // list
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={interactive ? () => onClick!(product) : undefined}
      className={cn(
        "flex w-full text-left gap-3 rounded-xl border border-border bg-card p-3 transition-colors",
        isBlocked
          ? "opacity-60 cursor-not-allowed"
          : "hover:border-primary/40 active:scale-[0.99]",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-bold">{product.name}</h3>
          {product.is_sold_out && <SoldOutBadge />}
        </div>
        {showDescription && product.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
        )}
        <p className="mt-2 text-base font-black text-primary">{formatBRL(product.price)}</p>
      </div>
      {showImage && (
        <div
          className={cn(
            "shrink-0 overflow-hidden rounded-lg bg-muted",
            imageAspect === "wide"
              ? "h-20 w-32 sm:h-24 sm:w-40"
              : imageAspect === "tall"
                ? "h-28 w-20 sm:h-32 sm:w-24"
                : "h-20 w-20 sm:h-24 sm:w-24",
          )}
        >
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl">🍢</div>
          )}
        </div>
      )}
    </Tag>
  );
}
