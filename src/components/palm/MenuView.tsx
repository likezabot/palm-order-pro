import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Pencil, Search, X, ArrowRightLeft, Minus } from "lucide-react";
import { CartItem, Product, CATEGORY_LABELS, CATEGORIES } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";
import { fetchAllOrders, sortByPersistedOrder } from "@/lib/product-order";
import MoveTableDialog from "./MoveTableDialog";
import { RenameTableDialog } from "./RenameTableDialog";
import { GroupVariantDialog } from "./GroupVariantDialog";
import {
  useProductGroups,
  getHiddenProductNames,
  resolveGroupMembers,
  type ProductGroup,
} from "@/lib/product-groups";
import { CartFab } from "./CartFab";
import { EsgotadoConfirmDialog } from "./EsgotadoConfirmDialog";
import { useProductStockMap, useProductRecipes, isProductEsgotado } from "@/hooks/use-product-stock-map";

interface Props {
  onAdd: (product: Product) => void;
  onDecrement: (product: Product) => void;
  cart: CartItem[];
  total: number;
  itemCount: number;
  onViewCart: () => void;
  onBack: () => void;
  tableName?: string;
  originalTableName?: string;
  onRenameTable?: (newName: string) => void | Promise<void>;
  /** Quando presente, habilita o botão "mover mesa" (só faz sentido com pedido já enviado) */
  existingOrderId?: string | null;
  onTableMoved?: (newTable: string) => void;
}

const MenuView = ({ onAdd, onDecrement, cart, total, itemCount, onViewCart, onBack, tableName, originalTableName, onRenameTable, existingOrderId, onTableMoved }: Props) => {
  const [activeCategory, setActiveCategory] = useState<string>("espetos");
  const [openGroup, setOpenGroup] = useState<ProductGroup | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [esgotadoPending, setEsgotadoPending] = useState<Product | null>(null);
  const { playFeedback } = useFeedback();
  const { data: stockMap } = useProductStockMap();
  const { data: recipes } = useProductRecipes();
  const { data: productGroups = [] } = useProductGroups();
  const hiddenProductNames = useMemo(
    () => getHiddenProductNames(productGroups, activeCategory),
    [productGroups, activeCategory],
  );

  const isEsgotado = (id: string) => isProductEsgotado(stockMap, id, recipes);

  // Intercepta o add: se o item estiver esgotado (estoque <= 0 e vinculado),
  // abre confirm dialog. Se confirmar, chama onAdd normalmente.
  const handleAdd = (product: Product) => {
    if (isEsgotado(product.id)) {
      playFeedback("click");
      setEsgotadoPending(product);
      return;
    }
    onAdd(product);
  };

  const canRename = !!tableName && tableName !== "BALCÃO" && !!onRenameTable;
  const canMove = !!existingOrderId && !!originalTableName && originalTableName !== "BALCÃO" && !!onTableMoved;

  const { data: products = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      // Timeout duro de 10s — se a rede do tablet pendurar, falha rápido
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

  const isSearching = search.trim().length > 0;

  // For search, hide all members of all groups (except triggers) across categories.
  const allHiddenNames = useMemo(() => {
    const set = new Set<string>();
    for (const g of productGroups) {
      const triggerNorm = g.trigger_product_name.toLowerCase().trim();
      for (const m of g.member_names) {
        if (m.toLowerCase().trim() !== triggerNorm) set.add(m.toLowerCase());
      }
    }
    return set;
  }, [productGroups]);

  // Filtragem: busca global tem prioridade; senão, por categoria.
  const filteredRaw = useMemo(() => {
    if (isSearching) {
      const q = search.trim().toLowerCase();
      return products.filter(
        (p) =>
          !allHiddenNames.has(p.name.toLowerCase()) &&
          p.name.toLowerCase().includes(q)
      );
    }
    return products.filter((p) => {
      if (p.category !== activeCategory) return false;
      if (hiddenProductNames.includes(p.name.toLowerCase())) return false;
      return true;
    });
  }, [products, activeCategory, isSearching, search, hiddenProductNames, allHiddenNames]);

  const filteredOrdered = isSearching
    ? filteredRaw
    : sortByPersistedOrder(filteredRaw, orderMap[activeCategory] ?? null);

  // Disponíveis primeiro, esgotados ao final (estável).
  const filtered = useMemo(() => {
    const withIdx = filteredOrdered.map((p, idx) => ({ p, idx, esgotado: isProductEsgotado(stockMap, p.id, recipes) }));
    withIdx.sort((a, b) => {
      if (a.esgotado !== b.esgotado) return a.esgotado ? 1 : -1;
      return a.idx - b.idx;
    });
    return withIdx.map((x) => x.p);
  }, [filteredOrdered, stockMap, recipes]);

  // Contador por categoria (soma quantidades).
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const productCatById = new Map(products.map((p) => [p.id, p.category]));
    for (const item of cart) {
      const cat = productCatById.get(item.product.id) ?? item.product.category;
      if (!cat) continue;
      counts[cat] = (counts[cat] ?? 0) + item.quantity;
    }
    return counts;
  }, [cart, products]);

  // Groups in current category with resolved trigger products.
  const activeGroups = useMemo(() => {
    if (isSearching) return [];
    return productGroups
      .filter((g) => g.category === activeCategory)
      .map((g) => {
        const variants = resolveGroupMembers(g, products);
        const triggerNorm = g.trigger_product_name.toLowerCase().trim();
        const triggerProduct =
          variants.find((v) => v.product && v.name.toLowerCase().trim() === triggerNorm)?.product ??
          variants.find((v) => v.product)?.product ?? null;
        return { group: g, triggerProduct, variants, variantCount: variants.filter((v) => v.product).length };
      })
      .filter((x) => !!x.triggerProduct);
  }, [productGroups, activeCategory, products, isSearching]);

  const groupByTriggerId = useMemo(() => {
    const map = new Map<string, { group: ProductGroup; triggerProduct: Product; variantCount: number }>();
    for (const g of activeGroups) {
      if (g.triggerProduct) {
        map.set(g.triggerProduct.id, {
          group: g.group,
          triggerProduct: g.triggerProduct,
          variantCount: g.variantCount,
        });
      }
    }
    return map;
  }, [activeGroups]);

  const getQty = (id: string) =>
    cart.filter((i) => i.product.id === id).reduce((sum, i) => sum + i.quantity, 0);

  const getGroupQty = (g: ProductGroup) => {
    const memberIds = new Set(
      resolveGroupMembers(g, products)
        .map((v) => v.product?.id)
        .filter((id): id is string => !!id)
    );
    return cart
      .filter((i) => memberIds.has(i.product.id))
      .reduce((sum, i) => sum + i.quantity, 0);
  };


  return (
    <div className="flex h-screen-safe flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 glass-card p-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-2 mb-1.5">
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
              {canMove && (
                <button
                  onClick={() => {
                    playFeedback("click");
                    setMoveOpen(true);
                  }}
                  aria-label="Mover para outra mesa"
                  title="Mover para outra mesa"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary active:scale-90 transition-all"
                >
                  <ArrowRightLeft size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search field */}
        <div className="relative mb-1.5 group">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            inputMode="search"
            placeholder="Buscar item no cardápio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-border bg-card pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground shadow-soft focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Category tabs */}
        {!isSearching && (
          <div className="flex gap-0 overflow-x-auto no-scrollbar border-b border-border/60 -mx-2.5 px-2.5">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat;
              const count = categoryCounts[cat] ?? 0;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    playFeedback("click");
                    setActiveCategory(cat);
                  }}
                  className={`relative inline-flex min-w-[80px] items-center justify-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm tracking-wide transition-colors ${
                    isActive
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground/70 font-medium hover:text-foreground"
                  }`}
                >
                  <span>{CATEGORY_LABELS[cat]}</span>
                  {count > 0 && (
                    <span
                      key={count}
                      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none bg-foreground/10 text-foreground/80 animate-badge-pop"
                    >
                      {count}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute left-3 right-3 bottom-0 h-[2px] rounded-full bg-brand-gradient" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
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

        {!isLoading && !error && products.length > 0 && filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {isSearching
              ? `Nenhum item encontrado para "${search}".`
              : "Nenhum item nesta categoria."}
          </p>
        )}

        {!isLoading && !error && products.length > 0 && filtered.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5 p-2">
            {filtered.map((product) => {
              const groupEntry = groupByTriggerId.get(product.id);
              if (groupEntry) {
                const { group, triggerProduct, variantCount } = groupEntry;
                const groupQty = getGroupQty(group);
                return (
                  <div
                    key={`__group__${group.id}`}
                    className="relative flex flex-col rounded-2xl border border-border bg-card p-2.5 shadow-soft hover:shadow-card hover:border-primary/40 transition-all"
                  >
                    <span className="font-bold text-base text-foreground leading-tight">
                      {group.name}
                    </span>
                    <span className="mt-0.5 text-[11px] text-muted-foreground">
                      Ver opções · {variantCount} {variantCount === 1 ? "opção" : "opções"}
                    </span>
                    <span className="mt-1 text-base font-extrabold text-primary">
                      R$ {triggerProduct.price.toFixed(2)}
                    </span>
                    <button
                      onClick={() => {
                        playFeedback("click");
                        setOpenGroup(group);
                      }}
                      className="mt-2 w-full rounded-lg bg-primary px-2 py-2 text-sm font-bold text-primary-foreground active:scale-95 transition-transform"
                    >
                      Ver opções
                    </button>
                    {groupQty > 0 && (
                      <span className="absolute -top-2 -right-2 flex h-7 min-w-[28px] items-center justify-center rounded-full bg-brand-gradient text-sm font-black text-primary-foreground border-2 border-background px-1.5 shadow-glow animate-badge-pop">
                        {groupQty}
                      </span>
                    )}
                  </div>
                );
              }
              const qty = getQty(product.id);
              const esgotado = isEsgotado(product.id);
              return (
                <div
                  key={product.id}
                  className={`relative flex flex-col rounded-2xl border p-2.5 shadow-soft transition-all ${
                    esgotado
                      ? "bg-muted/30 border-border opacity-60"
                      : "bg-card border-border hover:border-primary/40 hover:shadow-card"
                  }`}
                >
                  <span className={`font-bold text-base leading-tight text-foreground ${qty > 0 ? "pl-9" : ""}`}>
                    {product.name}
                  </span>
                  {esgotado && (
                    <span className="mt-0.5 text-[11px] italic text-muted-foreground">
                      Indisponível
                    </span>
                  )}
                  <span className={`mt-1 text-base font-extrabold ${esgotado ? "text-muted-foreground" : "text-primary"}`}>
                    R$ {product.price.toFixed(2)}
                  </span>
                  <button
                    onClick={() => handleAdd(product)}
                    className={`mt-2 w-full rounded-lg px-2 py-2 text-sm font-bold transition-transform active:scale-95 ${
                      esgotado
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {esgotado ? "Indisponível" : "Adicionar"}
                  </button>
                  {qty > 0 && (
                    <span
                      key={qty}
                      className="absolute -top-2 -right-2 flex h-7 min-w-[28px] items-center justify-center rounded-full bg-brand-gradient text-sm font-black text-primary-foreground border-2 border-background px-1.5 shadow-glow animate-badge-pop"
                    >
                      {qty}
                    </span>
                  )}
                  {qty > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playFeedback("click");
                        onDecrement(product);
                      }}
                      aria-label={`Diminuir ${product.name}`}
                      className="absolute top-2 left-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/15 text-destructive border border-destructive/40 active:scale-90 hover:bg-destructive/25 transition-all shadow-soft"
                    >
                      <Minus size={16} strokeWidth={3} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <GroupVariantDialog
        open={!!openGroup}
        onOpenChange={(o) => { if (!o) setOpenGroup(null); }}
        groupName={openGroup?.name ?? ""}
        variants={
          openGroup
            ? resolveGroupMembers(openGroup, products).map((v) => ({
                name: v.product?.name ?? v.name,
                product: v.product,
              }))
            : []
        }
        isEsgotado={isEsgotado}
        getQty={getQty}
        onPick={(_name, product) => {
          setOpenGroup(null);
          handleAdd(product);
        }}
      />

      {canMove && existingOrderId && originalTableName && (
        <MoveTableDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          orderId={existingOrderId}
          currentTable={originalTableName}
          onMoved={(newTable) => onTableMoved?.(newTable)}
        />
      )}

      <RenameTableDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        value={renameValue}
        onValueChange={setRenameValue}
        tableName={tableName}
        originalTableName={originalTableName}
        onRename={(v) => onRenameTable?.(v)}
      />


      <EsgotadoConfirmDialog
        open={!!esgotadoPending}
        productName={esgotadoPending?.name ?? null}
        onCancel={() => setEsgotadoPending(null)}
        onConfirm={() => {
          if (esgotadoPending) onAdd(esgotadoPending);
          setEsgotadoPending(null);
        }}
      />

      <CartFab itemCount={itemCount} total={total} onClick={onViewCart} />
    </div>
  );
};

export default MenuView;
