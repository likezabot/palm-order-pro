import { useState } from "react";
import { Plus, Check } from "lucide-react";
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
  /** Override por categoria. "compact" reduz para nome+preço, sem imagem grande nem descrição. */
  cardStyle?: "compact" | "detailed";
  onClick?: (p: PublicProduct) => void;
  /** Quando informado, mostra botão "Adicionar" inline que adiciona 1 unidade direto. */
  onQuickAdd?: (p: PublicProduct) => void;
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function QuickAddButton({
  onClick,
  disabled,
  size = "md",
}: {
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const [justAdded, setJustAdded] = useState(false);
  const handle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onClick(e);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 700);
  };
  const dim = size === "sm" ? "h-9 w-9" : "h-10 w-10";
  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled}
      aria-label="Adicionar ao carrinho"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all",
        dim,
        disabled
          ? "opacity-40 cursor-not-allowed"
          : "hover:brightness-110 active:scale-90",
        justAdded && "scale-110 bg-success",
      )}
    >
      {justAdded ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
    </button>
  );
}

export default function ProductCard({
  product,
  disabled,
  layout = "list",
  showImage = true,
  showDescription = true,
  imageAspect = "square",
  cardStyle = "detailed",
  onClick,
  onQuickAdd,
}: Props) {
  const isBlocked = disabled || product.is_sold_out;
  const interactive = !isBlocked && !!onClick;
  const Tag: any = interactive ? "button" : "article";
  const showQuickAdd = !!onQuickAdd && !isBlocked;

  // Em modo compacto: força ocultar descrição e usa imagem reduzida (ou nenhuma).
  const effectiveShowDescription = cardStyle === "compact" ? false : showDescription;
  const effectiveShowImage = cardStyle === "compact" ? false : showImage;

  const aspectClass =
    imageAspect === "wide"
      ? "aspect-[16/9]"
      : imageAspect === "tall"
        ? "aspect-[3/4]"
        : "aspect-square";

  // ---- Modo compacto: renderização enxuta (igual em list/grid) ----
  if (cardStyle === "compact") {
    return (
      <Tag
        type={interactive ? "button" : undefined}
        onClick={interactive ? () => onClick!(product) : undefined}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors",
          isBlocked
            ? "opacity-60 cursor-not-allowed"
            : "hover:border-primary/40 active:scale-[0.99]",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-bold">{product.name}</h3>
          {product.is_sold_out && <SoldOutBadge />}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-sm font-black text-primary">{formatBRL(product.price)}</p>
          {showQuickAdd && (
            <QuickAddButton onClick={() => onQuickAdd!(product)} size="sm" />
          )}
        </div>
      </Tag>
    );
  }

  if (layout === "grid") {
    return (
      <Tag
        type={interactive ? "button" : undefined}
        onClick={interactive ? () => onClick!(product) : undefined}
        className={cn(
          "group relative flex w-full flex-col text-left overflow-hidden rounded-2xl border border-border bg-card transition-all",
          isBlocked
            ? "opacity-60 cursor-not-allowed"
            : "hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.99]",
        )}
      >
        {effectiveShowImage && (
          <div className={cn("relative w-full bg-muted overflow-hidden", aspectClass)}>
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60 text-4xl">🍢</div>
            )}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col p-3">
          <div className="flex items-start gap-2">
            <h3 className="line-clamp-2 flex-1 text-sm font-bold leading-tight">{product.name}</h3>
            {product.is_sold_out && <SoldOutBadge />}
          </div>
          {effectiveShowDescription && product.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
          )}
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <p className="text-lg font-black text-primary leading-none">
              {formatBRL(product.price)}
            </p>
            {showQuickAdd && (
              <QuickAddButton onClick={() => onQuickAdd!(product)} />
            )}
          </div>
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
        "group relative flex w-full text-left gap-3 rounded-2xl border border-border bg-card p-3 transition-all",
        isBlocked
          ? "opacity-60 cursor-not-allowed"
          : "hover:border-primary/50 hover:shadow-md active:scale-[0.99]",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-bold">{product.name}</h3>
          {product.is_sold_out && <SoldOutBadge />}
        </div>
        {effectiveShowDescription && product.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-lg font-black text-primary leading-none">{formatBRL(product.price)}</p>
          {showQuickAdd && <QuickAddButton onClick={() => onQuickAdd!(product)} />}
        </div>
      </div>
      {effectiveShowImage && (
        <div
          className={cn(
            "relative shrink-0 overflow-hidden rounded-xl bg-muted",
            imageAspect === "wide"
              ? "h-20 w-32 sm:h-24 sm:w-40"
              : imageAspect === "tall"
                ? "h-28 w-20 sm:h-32 sm:w-24"
                : "h-24 w-24 sm:h-28 sm:w-28",
          )}
        >
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60 text-3xl">🍢</div>
          )}
        </div>
      )}
    </Tag>
  );
}
