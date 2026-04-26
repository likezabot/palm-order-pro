import { useState } from "react";
import { Plus, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { PublicProduct } from "@/lib/public-menu";
import type { ProductGroup } from "@/lib/product-groups";
import SoldOutBadge from "./SoldOutBadge";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: ProductGroup | null;
  variants: PublicProduct[];
  trigger: PublicProduct | null;
  /** Igual ao quickAdd da página: adiciona 1 unidade ao carrinho, sem nota. */
  onAdd: (p: PublicProduct) => void;
  /** Quando true (cardápio fechado/preview), botões ficam desabilitados. */
  disabled?: boolean;
};

/**
 * Sheet de variantes do cardápio público.
 * - Reusa o mesmo handler `cart.add(product, 1, "")` (igual `onQuickAdd`).
 * - Não dispara toast ao adicionar (consistente com remoção feita anteriormente).
 * - Variante esgotada online → badge "Esgotado" + botão desabilitado.
 */
export default function PublicGroupVariantSheet({
  open,
  onOpenChange,
  group,
  variants,
  trigger,
  onAdd,
  disabled,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl border-t bg-background p-0 max-h-[85vh] overflow-hidden flex flex-col"
      >
        <SheetHeader className="px-4 pt-5 pb-3 text-left">
          <SheetTitle className="text-lg font-black tracking-tight">
            {group?.name ?? trigger?.name ?? ""}
          </SheetTitle>
          {trigger?.description ? (
            <SheetDescription className="text-sm text-muted-foreground">
              {trigger.description}
            </SheetDescription>
          ) : (
            <SheetDescription className="text-xs text-muted-foreground">
              Escolha uma opção:
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-2">
          {variants.map((v) => (
            <VariantRow
              key={v.id}
              variant={v}
              onAdd={() => onAdd(v)}
              disabled={disabled || v.is_sold_out}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VariantRow({
  variant,
  onAdd,
  disabled,
}: {
  variant: PublicProduct;
  onAdd: () => void;
  disabled?: boolean;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const handleClick = () => {
    if (disabled) return;
    onAdd();
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 700);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 transition-colors",
        disabled ? "opacity-60" : "hover:border-primary/40",
      )}
    >
      {variant.image_url ? (
        <img
          src={variant.image_url}
          alt={variant.name}
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded-lg object-cover bg-muted"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl">
          🥤
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold">{variant.name}</p>
          {variant.is_sold_out && <SoldOutBadge />}
        </div>
        <p className="mt-0.5 text-base font-black text-primary tabular-nums">
          {formatBRL(variant.price)}
        </p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={`Adicionar ${variant.name} ao carrinho`}
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary-foreground transition-all",
          "shadow-[0_6px_16px_-4px_hsl(var(--primary)/0.55)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          disabled
            ? "opacity-40 cursor-not-allowed"
            : "hover:brightness-110 active:scale-90",
          justAdded && "scale-110",
        )}
        style={{
          background: justAdded
            ? "linear-gradient(135deg, hsl(var(--success)) 0%, hsl(var(--success)/0.85) 100%)"
            : "var(--brand-gradient)",
        }}
      >
        {justAdded ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
    </div>
  );
}
