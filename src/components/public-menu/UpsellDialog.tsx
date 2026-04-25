import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { PublicProduct } from "@/lib/public-menu";
import type { PublicCartItem } from "@/lib/public-cart";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allProducts: PublicProduct[];
  cartItems: PublicCartItem[];
  onAdd: (p: PublicProduct) => void;
  onContinue: () => void;
};

const UPSELL_KEYWORDS = ["pão de alho", "pao de alho", "queijo coalho", "coca", "guaraná", "guarana", "cerveja", "heineken", "brahma", "skol", "água", "agua"];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pickSuggestions(all: PublicProduct[], cart: PublicCartItem[]): PublicProduct[] {
  const cartIds = new Set(cart.map((c) => c.product_id));
  const eligible = all.filter(
    (p) => p.active && p.is_available_online && !p.is_sold_out && !cartIds.has(p.id),
  );

  // Prioriza por palavras-chave de upsell, depois featured, depois bebidas/cervejas
  const byKeyword = eligible.filter((p) => {
    const name = p.name.toLowerCase();
    return UPSELL_KEYWORDS.some((k) => name.includes(k));
  });
  const featured = eligible.filter((p) => p.is_featured && !byKeyword.includes(p));
  const drinks = eligible.filter(
    (p) => (p.category === "bebidas" || p.category === "cervejas") && !byKeyword.includes(p) && !featured.includes(p),
  );

  const ranked = [...byKeyword, ...featured, ...drinks];
  const seen = new Set<string>();
  const unique: PublicProduct[] = [];
  for (const p of ranked) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    unique.push(p);
    if (unique.length >= 3) break;
  }
  return unique;
}

export default function UpsellDialog({
  open, onOpenChange, allProducts, cartItems, onAdd, onContinue,
}: Props) {
  const suggestions = useMemo(
    () => pickSuggestions(allProducts, cartItems),
    [allProducts, cartItems],
  );

  if (suggestions.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quer incluir algo a mais?</DialogTitle>
          <DialogDescription>
            Sugestões para deixar seu pedido ainda melhor. Você pode pular se quiser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {suggestions.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-border p-3"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl">🍢</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{p.name}</p>
                <p className="text-sm font-black text-primary">{formatBRL(p.price)}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onAdd(p)}
                aria-label={`Adicionar ${p.name} ao carrinho`}
              >
                <Plus size={14} />
                Adicionar
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={onContinue} size="lg" className="w-full">
            Continuar para o pedido
          </Button>
          <Button onClick={onContinue} variant="ghost" size="sm" className="w-full">
            Não, obrigado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
