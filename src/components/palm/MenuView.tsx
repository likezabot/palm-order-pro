import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { CartItem, Product, CATEGORY_LABELS, CATEGORIES } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  onAdd: (product: Product) => void;
  cart: CartItem[];
  total: number;
  itemCount: number;
  onViewCart: () => void;
  onBack: () => void;
}

// Subgrupos por categoria, mapeados por nome do produto.
// Match é por substring case-insensitive — robusto a pequenas variações.
type Subgroup = { label: string; matchers: string[] };

const SUBGROUPS: Record<string, Subgroup[]> = {
  bebidas: [
    { label: "KS 290ml", matchers: ["ks coca-cola zero", "ks coca-cola normal"] },
    {
      label: "Mini 220ml",
      matchers: [
        "coca-cola 220ml",
        "coca-cola zero 220ml",
        "fanta-uva 220ml",
        "guaraná 220ml",
        "fanta-laranja 220ml",
        "sprite 220ml",
      ],
    },
    { label: "Refri 350ml", matchers: ["coca-cola 350ml", "coca-cola zero 350ml"] },
    {
      label: "Refri 600ml",
      matchers: ["coca-cola 600ml", "coca-cola zero 600ml", "tubaina 600ml"],
    },
    { label: "Refri 1L", matchers: ["coca-cola 1l", "guaraná 1l"] },
    { label: "Refri 2L", matchers: ["coca-cola 2l", "coca-cola zero 2l"] },
    { label: "Água", matchers: ["água com gás", "água sem gás"] },
    {
      label: "Sucos Del Valle 290ml",
      matchers: [
        "suco del valle maracujá",
        "suco del valle pêssego",
        "suco del valle uva",
      ],
    },
  ],
  // Cervejas: removido subgrupo — agora cards diretos como qualquer outra categoria.
};

// Variantes do produto base "Porco" — apresentadas em popup ao tocar no card.
const PORCO_VARIANTS = ["Porco", "Panceta suína", "Costela suína"] as const;
// Nomes que devem ser ocultados da grade de Espetos (apresentados via popup do Porco).
const HIDDEN_ESPETO_NAMES = ["panceta suína", "costela suína"];

const matchesSubgroup = (product: Product, sub: Subgroup) => {
  const n = product.name.toLowerCase();
  return sub.matchers.some((m) => n.includes(m));
};

const MenuView = ({ onAdd, cart, total, itemCount, onViewCart, onBack }: Props) => {
  const [activeCategory, setActiveCategory] = useState<string>("espetos");
  const [openSubgroup, setOpenSubgroup] = useState<Subgroup | null>(null);
  const [porcoOpen, setPorcoOpen] = useState(false);
  const { playFeedback } = useFeedback();

  const { data: products = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      // Timeout duro de 10s — se a rede do tablet pendurar, falha rápido
      // e mostra botão "Tentar novamente" em vez de spinner eterno.
      const fetchPromise = supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("name");

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout: rede lenta ou sem conexão")), 10_000)
      );

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
      if (error) throw error;
      return data as Product[];
    },
    retry: 1,
  });

  // Filtragem por categoria + ocultar Panceta/Costela em Espetos (entram via popup do Porco).
  const filtered = products.filter((p) => {
    if (p.category !== activeCategory) return false;
    if (activeCategory === "espetos" && HIDDEN_ESPETO_NAMES.includes(p.name.toLowerCase())) {
      return false;
    }
    return true;
  });
  const subgroups = SUBGROUPS[activeCategory];

  // Produto base "Porco" (ativo). Usado para preço e id base.
  const porcoBase = products.find(
    (p) => p.category === "espetos" && p.name.toLowerCase() === "porco"
  );
  // Só mostra o card Porco se ele existir nos espetos ativos.
  const showPorcoCard = activeCategory === "espetos" && !!porcoBase;

  const getQty = (id: string) => cart.find((i) => i.product.id === id)?.quantity || 0;

  const subgroupQty = (sub: Subgroup) =>
    filtered
      .filter((p) => matchesSubgroup(p, sub))
      .reduce((sum, p) => sum + getQty(p.id), 0);

  const subgroupProducts = openSubgroup
    ? filtered.filter((p) => matchesSubgroup(p, openSubgroup))
    : [];

  // Quantidade total no carrinho de qualquer variante de Porco (badge do card).
  const porcoQty = cart
    .filter((i) => i.product.id === porcoBase?.id || i.product.name.startsWith("Porco"))
    .reduce((sum, i) => sum + i.quantity, 0);

  const addPorcoVariant = (variant: string) => {
    if (!porcoBase) return;
    const finalName = variant === "Porco" ? "Porco" : `Porco - ${variant}`;
    // Mantém o id base do Porco para que o backend continue referenciando o produto real.
    onAdd({ ...porcoBase, name: finalName });
    setPorcoOpen(false);
  };

  return (
    <div className="flex min-h-screen flex-col pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-3">
        <button
          onClick={() => {
            playFeedback("click");
            onBack();
          }}
          className="flex items-center gap-2 text-muted-foreground text-base mb-2"
        >
          <ArrowLeft size={20} /> Voltar
        </button>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                playFeedback("click");
                setActiveCategory(cat);
              }}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-150 ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground border border-border"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / error state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center p-10 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-3" />
          <p className="text-sm">Carregando cardápio...</p>
        </div>
      )}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <p className="text-sm text-destructive mb-1 font-bold">Não foi possível carregar o cardápio</p>
          <p className="text-xs text-muted-foreground mb-4">
            {error instanceof Error ? error.message : "Erro desconhecido"}
          </p>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground active:scale-95 transition-transform disabled:opacity-60"
          >
            {isFetching ? "Tentando..." : "Tentar novamente"}
          </button>
        </div>
      )}
      {!isLoading && !error && products.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Nenhum produto cadastrado.
        </p>
      )}

      {/* Subgroup squares OR product grid */}
      {!isLoading && !error && products.length > 0 && (subgroups ? (
        <div className="grid grid-cols-2 gap-3 p-3">
          {subgroups.map((sub) => {
            const qty = subgroupQty(sub);
            return (
              <button
                key={sub.label}
                onClick={() => {
                  playFeedback("click");
                  setOpenSubgroup(sub);
                }}
                className="relative flex aspect-square flex-col items-center justify-center rounded-lg bg-card border border-border p-4 text-center transition-all duration-150 active:scale-[0.96]"
              >
                <span className="text-base font-bold text-foreground leading-tight">
                  {sub.label}
                </span>
                <span className="mt-2 text-xs text-muted-foreground">Toque para ver</span>
                {qty > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {qty}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-3">
          {filtered.map((product) => {
            const qty = getQty(product.id);
            return (
              <button
                key={product.id}
                onClick={() => {
                  onAdd(product);
                }}
                className="relative flex flex-col rounded-lg bg-card border border-border p-4 text-left transition-all duration-150 active:scale-[0.96]"
              >
                <span className="font-semibold text-base text-foreground leading-tight">
                  {product.name}
                </span>
                <span className="mt-1 text-sm text-primary font-bold">
                  R$ {product.price.toFixed(2)}
                </span>
                <span className="mt-2 text-sm font-semibold text-primary">+ ADD</span>
                {qty > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {qty}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {/* Subgroup dialog */}
      <Dialog open={!!openSubgroup} onOpenChange={(o) => !o && setOpenSubgroup(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{openSubgroup?.label}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2">
            {subgroupProducts.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum item disponível.</p>
            )}
            {subgroupProducts.map((product) => {
              const qty = getQty(product.id);
              return (
                <button
                  key={product.id}
                  onClick={() => onAdd(product)}
                  className="relative flex items-center justify-between rounded-lg bg-card border border-border p-4 text-left transition-all duration-150 active:scale-[0.97] min-h-[64px]"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-base text-foreground leading-tight">
                      {product.name}
                    </span>
                    <span className="mt-1 text-sm text-primary font-bold">
                      R$ {product.price.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-primary">+ ADD</span>
                  {qty > 0 && (
                    <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {qty}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => {
              playFeedback("click");
              setOpenSubgroup(null);
            }}
            className="mt-2 w-full rounded-lg bg-primary p-3 text-base font-bold text-primary-foreground active:scale-[0.97] transition-transform min-h-[48px]"
          >
            Concluir
          </button>
        </DialogContent>
      </Dialog>

      {/* Floating cart button */}
      {itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-background/90 backdrop-blur border-t border-border">
          <button
            onClick={() => {
              playFeedback("click");
              onViewCart();
            }}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-primary p-4 text-lg font-bold text-primary-foreground active:scale-[0.97] transition-transform duration-150 min-h-[56px]"
          >
            <ShoppingCart size={22} />
            VER PEDIDO — {itemCount} {itemCount === 1 ? "item" : "itens"} — R$ {total.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
};

export default MenuView;
