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
  fullDescription?: boolean;
  imageAspect?: "square" | "wide" | "tall";
  /** Override por categoria. "compact" reduz para nome+preço, sem imagem grande nem descrição. */
  cardStyle?: "compact" | "detailed";
  /** Sombra global (vem de settings.card_style). Default true (elevated). */
  elevated?: boolean;
  onClick?: (p: PublicProduct) => void;
  /** Quando informado, mostra botão "Adicionar" inline que adiciona 1 unidade direto. */
  onQuickAdd?: (p: PublicProduct) => void;
  /** Sobrescreve o texto do preço (ex.: "a partir de R$ 5,00" para card de grupo). */
  priceLabel?: string;
  /** Mostra um chevron "›" indicando que o card abre algo (popup de variantes). */
  trailingHint?: boolean;
  className?: string;
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
        "btn-accent inline-flex shrink-0 items-center justify-center rounded-full text-primary-foreground transition-all",
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
  fullDescription = false,
  imageAspect = "square",
  cardStyle = "detailed",
  elevated = true,
  onClick,
  onQuickAdd,
  priceLabel,
  trailingHint,
  className,
}: Props) {
  const isBlocked = disabled || product.is_sold_out;
  const interactive = !isBlocked && !!onClick;
  const Tag: any = interactive ? "button" : "article";
  const showQuickAdd = !!onQuickAdd && !isBlocked && !priceLabel;
  const priceText = priceLabel ?? formatBRL(product.price);

  const effectiveShowDescription = cardStyle === "compact" ? false : showDescription;
  const effectiveShowImage = cardStyle === "compact" ? false : showImage;
  const shadowClass = elevated ? "shadow-[var(--shadow-warm)]" : "";

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
          className
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-bold">{product.name}</h3>
          {product.is_sold_out && <SoldOutBadge />}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-sm font-black text-primary">{priceText}</p>
          {showQuickAdd && (
            <QuickAddButton onClick={() => onQuickAdd!(product)} size="sm" productName={product.name} />
          )}
          {trailingHint && (
            <span aria-hidden className="text-base leading-none text-muted-foreground/60">›</span>
          )}
        </div>
      </Tag>
    );
  }

  // ---- Grid (tablet/desktop ou quando explicitamente forçado): cards menos altos ----
  if (layout === "grid") {
    const imgClass =
      imageAspect === "wide"
        ? "aspect-[16/10]"
        : imageAspect === "tall"
          ? "aspect-[4/5]"
          : "aspect-square";

    return (
      <Tag
        type={interactive ? "button" : undefined}
        onClick={interactive ? () => onClick!(product) : undefined}
        className={cn(
          "group relative flex w-full flex-col text-left overflow-hidden rounded-xl border border-border/60 bg-card transition-all duration-300",
          shadowClass,
          isBlocked
            ? "opacity-60 cursor-not-allowed"
            : "hover:border-primary/40 hover:-translate-y-0.5 active:scale-[0.99]",
          className
        )}
      >
        {effectiveShowImage && (
          <div className={cn("relative w-full bg-muted overflow-hidden max-h-[120px] sm:max-h-none", imgClass)}>
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[hsl(28_45%_92%)] to-[hsl(36_50%_96%)] text-2xl opacity-80">🍢</div>
            )}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col p-2.5">
          <div className="flex items-start gap-2">
            <h3 className="line-clamp-2 flex-1 text-sm font-bold leading-tight">{product.name}</h3>
            {product.is_sold_out && <SoldOutBadge />}
          </div>
          {effectiveShowDescription && product.description && (
            <p className={cn("mt-1 text-[11px] text-muted-foreground", !fullDescription && "line-clamp-1")}>{product.description}</p>
          )}
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <p className="text-base font-black text-primary leading-none tracking-tight tabular-nums">
              {priceText}
            </p>
            {showQuickAdd && (
              <QuickAddButton onClick={() => onQuickAdd!(product)} size="sm" productName={product.name} />
            )}
            {trailingHint && !showQuickAdd && (
              <span aria-hidden className="text-base leading-none text-muted-foreground/60">›</span>
            )}
          </div>
        </div>
      </Tag>
    );
  }

  // ---- List (padrão mobile): card horizontal compacto, foto fixa pequena ----
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={interactive ? () => onClick!(product) : undefined}
      className={cn(
        "group relative flex w-full text-left items-stretch gap-3 rounded-xl border border-border/60 bg-card p-2.5 transition-all duration-200",
        shadowClass,
        isBlocked
          ? "opacity-60 cursor-not-allowed"
          : "hover:border-primary/40 active:scale-[0.99]",
        className
      )}
    >
      {effectiveShowImage && (
        <div
          className={cn(
            "relative shrink-0 overflow-hidden rounded-lg bg-muted self-center",
            "h-[72px] w-[72px] sm:h-24 sm:w-24",
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
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[hsl(28_45%_92%)] to-[hsl(36_50%_96%)] text-2xl opacity-80">🍢</div>
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="line-clamp-2 flex-1 text-sm font-bold leading-snug sm:text-base">
              {product.name}
            </h3>
            {product.is_sold_out && <SoldOutBadge />}
          </div>
          {effectiveShowDescription && product.description && (
            <p className={cn("mt-0.5 text-[11px] text-muted-foreground sm:text-xs", !fullDescription && "line-clamp-1 sm:line-clamp-2")}>
              {product.description}
            </p>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-base font-black text-primary leading-none tracking-tight tabular-nums sm:text-lg">
            {priceText}
          </p>
          {showQuickAdd && (
            <QuickAddButton onClick={() => onQuickAdd!(product)} productName={product.name} />
          )}
          {trailingHint && !showQuickAdd && (
            <span aria-hidden className="text-lg leading-none text-muted-foreground/60">›</span>
          )}
        </div>
      </div>
    </Tag>
  );
}
