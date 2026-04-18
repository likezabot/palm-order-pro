import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ShoppingCart, Pencil, Search, X, Star } from "lucide-react";
import { CartItem, Product, CATEGORY_LABELS, CATEGORIES } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";
import { fetchAllOrders, sortByPersistedOrder } from "@/lib/product-order";
import { useFavoriteProductIds } from "@/hooks/use-favorite-products";
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
  tableName?: string;
  originalTableName?: string;
  onRenameTable?: (newName: string) => void | Promise<void>;
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

const MenuView = ({ onAdd, cart, total, itemCount, onViewCart, onBack, tableName, originalTableName, onRenameTable }: Props) => {
  const [activeCategory, setActiveCategory] = useState<string>("favoritos");
  const [openSubgroup, setOpenSubgroup] = useState<Subgroup | null>(null);
  const [porcoOpen, setPorcoOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [search, setSearch] = useState("");
  const { playFeedback } = useFeedback();

  const canRename = !!tableName && tableName !== "BALCÃO" && !!onRenameTable;

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

  // Ordem persistida pelo Admin (settings.product_order_<categoria>)
  const { data: orderMap = {} } = useQuery({
    queryKey: ["product-order"],
    queryFn: () => fetchAllOrders([...CATEGORIES]),
    staleTime: 30_000,
  });

  // Top vendidos nos últimos 30 dias para a categoria "Favoritos"
  const { data: favoriteIds = [] } = useFavoriteProductIds(12, 30);

  const isSearching = search.trim().length > 0;

  // Filtragem: busca global tem prioridade; senão, por categoria (Favoritos é virtual).
  const filteredRaw = useMemo(() => {
    if (isSearching) {
      const q = search.trim().toLowerCase();
      return products.filter(
        (p) =>
          !HIDDEN_ESPETO_NAMES.includes(p.name.toLowerCase()) &&
          p.name.toLowerCase().includes(q)
      );
    }
    if (activeCategory === "favoritos") {
      const idx = new Map(favoriteIds.map((id, i) => [id, i]));
      return products
        .filter((p) => idx.has(p.id))
        .sort((a, b) => (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0));
    }
    return products.filter((p) => {
      if (p.category !== activeCategory) return false;
      if (activeCategory === "espetos" && HIDDEN_ESPETO_NAMES.includes(p.name.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [products, activeCategory, favoriteIds, isSearching, search]);

  const filtered = isSearching || activeCategory === "favoritos"
    ? filteredRaw
    : sortByPersistedOrder(filteredRaw, orderMap[activeCategory] ?? null);

  const subgroups = !isSearching && activeCategory !== "favoritos" ? SUBGROUPS[activeCategory] : undefined;

  // Produto base "Porco". Preferimos um cadastrado; se não houver, usamos a
  // Panceta suína como base (mesmo id/preço) para o card sintético funcionar.
  const porcoReal = products.find(
    (p) => p.category === "espetos" && p.name.toLowerCase() === "porco"
  );
  const porcoFallback = products.find(
    (p) => p.category === "espetos" && HIDDEN_ESPETO_NAMES.includes(p.name.toLowerCase())
  );
  const porcoBase = porcoReal ?? porcoFallback;
  // Mostra o card Porco em Espetos sempre que houver alguma variante disponível.
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
    .filter((i) => i.product.id.startsWith("porco-variant::"))
    .reduce((sum, i) => sum + i.quantity, 0);

  const addPorcoVariant = (variant: string) => {
    if (!porcoBase) return;
    const finalName = variant === "Porco" ? "Porco" : `Porco - ${variant}`;
    // Id sintético por variante para o carrinho agrupar cada uma como linha separada.
    // Como não é UUID (36 chars), o envio ao backend manda product_id=null e usa product_name.
    const syntheticId = `porco-variant::${variant}`;
    onAdd({ ...porcoBase, id: syntheticId, name: finalName });
    setPorcoOpen(false);
  };

  return (
    <div className="flex min-h-screen flex-col pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <button
            onClick={() => {
              playFeedback("click");
              onBack();
            }}
            className="flex items-center gap-2 text-muted-foreground text-base"
          >
            <ArrowLeft size={20} /> Voltar
          </button>

          {tableName && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-sm font-semibold text-foreground">
                {tableName === "BALCÃO" ? "BALCÃO" : `Mesa: ${tableName}`}
              </span>
              {canRename && (
                <button
                  onClick={() => {
                    playFeedback("click");
                    setRenameValue(tableName!);
                    setRenameOpen(true);
                  }}
                  aria-label="Renomear mesa"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary active:scale-90 transition-all"
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
          )}
        </div>

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
          {/* Card especial "Porco" — abre popup com 3 variantes */}
          {showPorcoCard && (
            <button
              key="__porco_card__"
              onClick={() => {
                playFeedback("click");
                setPorcoOpen(true);
              }}
              className="relative flex flex-col rounded-lg bg-card border border-border p-4 text-left transition-all duration-150 active:scale-[0.96]"
            >
              <span className="font-semibold text-base text-foreground leading-tight">
                Porco
              </span>
              <span className="mt-1 text-sm text-primary font-bold">
                R$ {porcoBase!.price.toFixed(2)}
              </span>
              <span className="mt-2 text-sm font-semibold text-primary">Escolher tipo</span>
              {porcoQty > 0 && (
                <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {porcoQty}
                </span>
              )}
            </button>
          )}
          {filtered
            .filter((p) => !(showPorcoCard && porcoReal && p.id === porcoReal.id))
            .map((product) => {
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

      {/* Porco variant dialog */}
      <Dialog open={porcoOpen} onOpenChange={setPorcoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Escolha o tipo de Porco</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2">
            {PORCO_VARIANTS.map((variant) => (
              <button
                key={variant}
                onClick={() => addPorcoVariant(variant)}
                className="rounded-lg bg-card border border-border p-4 text-left font-semibold text-foreground active:scale-[0.97] transition-transform min-h-[56px]"
              >
                {variant}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename table dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nome da mesa</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Substitua o número pelo nome do cliente (ex: "João").
          </p>
          <input
            type="text"
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Ex: João, Mesa do canto..."
            maxLength={40}
            className="w-full rounded-md border border-border bg-background p-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = renameValue.trim();
                if (v) {
                  onRenameTable?.(v);
                  setRenameOpen(false);
                }
              }
            }}
          />
          {/* Botão para resetar ao número original (só aparece se o nome atual for diferente) */}
          {originalTableName && tableName !== originalTableName && (
            <button
              onClick={() => {
                playFeedback("click");
                onRenameTable?.(originalTableName);
                setRenameOpen(false);
              }}
              className="w-full rounded-lg border border-border bg-card p-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary active:scale-[0.98] transition-all min-h-[48px]"
            >
              ↺ Voltar ao número original (Mesa {originalTableName})
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setRenameOpen(false)}
              className="flex-1 rounded-lg border border-border bg-secondary p-3 text-sm font-semibold text-secondary-foreground active:scale-[0.97] transition-transform min-h-[48px]"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const v = renameValue.trim();
                if (!v) return;
                playFeedback("click");
                onRenameTable?.(v);
                setRenameOpen(false);
              }}
              disabled={!renameValue.trim() || renameValue.trim() === tableName}
              className="flex-1 rounded-lg bg-primary p-3 text-sm font-bold text-primary-foreground active:scale-[0.97] transition-transform disabled:opacity-50 min-h-[48px]"
            >
              Salvar
            </button>
          </div>
        </DialogContent>
      </Dialog>

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
