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
  /** Sobrescreve o texto do preço (ex.: "a partir de R$ 5,00" para card de grupo). */
  priceLabel?: string;
  /** Mostra um chevron "›" indicando que o card abre algo (popup de variantes). */
  trailingHint?: boolean;
};


function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function QuickAddButton({
  onClick,
  disabled,
  productName,
  size = "md",
}: {
  onClick: (e: React.MouseEvent | React.KeyboardEvent) => void;
  disabled?: boolean;
  productName?: string;
  size?: "sm" | "md";
}) {
  const [justAdded, setJustAdded] = useState(false);
  const handle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onClick(e);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 700);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    // Evita que Enter/Espaço propague para o card pai (que também é button)
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handle(e);
    }
  };
  const dim = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const label = productName
    ? justAdded
      ? `${productName} adicionado ao carrinho`
      : `Adicionar ${productName} ao carrinho`
    : "Adicionar ao carrinho";
  return (
    <button
      type="button"
      onClick={handle}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      aria-label={label}
      aria-live="polite"
      aria-pressed={justAdded}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-primary-foreground transition-all",
        "shadow-[0_6px_16px_-4px_hsl(var(--primary)/0.55)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        dim,
        disabled
          ? "opacity-40 cursor-not-allowed"
          : "hover:brightness-110 hover:shadow-[0_8px_22px_-4px_hsl(var(--primary)/0.7)] active:scale-90",
        justAdded && "scale-110",
      )}
      style={{
        background: justAdded
          ? "linear-gradient(135deg, hsl(var(--success)) 0%, hsl(var(--success)/0.85) 100%)"
          : "var(--brand-gradient)",
      }}
    >
      {justAdded ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Plus className="h-4 w-4" aria-hidden="true" />
      )}
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
            <QuickAddButton onClick={() => onQuickAdd!(product)} size="sm" productName={product.name} />
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
          "group relative flex w-full flex-col text-left overflow-hidden rounded-2xl border border-border/60 bg-card transition-all duration-300",
          "shadow-[var(--shadow-warm)]",
          isBlocked
            ? "opacity-60 cursor-not-allowed"
            : "hover:border-primary/40 hover:shadow-[0_18px_40px_-16px_hsl(18_60%_25%/0.28),0_0_24px_-4px_hsl(var(--primary)/0.18)] hover:-translate-y-1 active:scale-[0.99]",
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
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[hsl(28_45%_92%)] to-[hsl(36_50%_96%)] text-4xl opacity-80">🍢</div>
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
            <p className="text-lg font-black text-primary leading-none tracking-tight tabular-nums">
              {formatBRL(product.price)}
            </p>
            {showQuickAdd && (
              <QuickAddButton onClick={() => onQuickAdd!(product)} productName={product.name} />
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
        "group relative flex w-full text-left gap-3 rounded-2xl border border-border/60 bg-card p-3 transition-all duration-300",
        "shadow-[var(--shadow-warm)]",
        isBlocked
          ? "opacity-60 cursor-not-allowed"
          : "hover:border-primary/40 hover:shadow-[0_16px_36px_-16px_hsl(18_60%_25%/0.28),0_0_20px_-4px_hsl(var(--primary)/0.15)] hover:-translate-y-0.5 active:scale-[0.99]",
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
          <p className="text-lg font-black text-primary leading-none tracking-tight tabular-nums">{formatBRL(product.price)}</p>
          {showQuickAdd && <QuickAddButton onClick={() => onQuickAdd!(product)} productName={product.name} />}
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
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[hsl(28_45%_92%)] to-[hsl(36_50%_96%)] text-3xl opacity-80">🍢</div>
          )}
        </div>
      )}
    </Tag>
  );
}
