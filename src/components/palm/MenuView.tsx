import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Pencil, Search, X, ArrowRightLeft } from "lucide-react";
import { CartItem, Product, CATEGORY_LABELS, CATEGORIES } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";
import { fetchAllOrders, sortByPersistedOrder } from "@/lib/product-order";
import MoveTableDialog from "./MoveTableDialog";
import {
  SUBGROUPS,
  HIDDEN_ESPETO_NAMES,
  matchesSubgroup,
  type Subgroup,
} from "./menu-subgroups";
import { RenameTableDialog } from "./RenameTableDialog";
import { PorcoVariantDialog } from "./PorcoVariantDialog";
import { getPorcoGroupProducts } from "@/lib/porco-group";
import { SubgroupDialog } from "./SubgroupDialog";
import { CartFab } from "./CartFab";
import { EsgotadoConfirmDialog } from "./EsgotadoConfirmDialog";
import { useProductStockMap, isProductEsgotado } from "@/hooks/use-product-stock-map";

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
  /** Quando presente, habilita o botão "mover mesa" (só faz sentido com pedido já enviado) */
  existingOrderId?: string | null;
  onTableMoved?: (newTable: string) => void;
}

const MenuView = ({ onAdd, cart, total, itemCount, onViewCart, onBack, tableName, originalTableName, onRenameTable, existingOrderId, onTableMoved }: Props) => {
  const [activeCategory, setActiveCategory] = useState<string>("espetos");
  const [openSubgroup, setOpenSubgroup] = useState<Subgroup | null>(null);
  const [porcoOpen, setPorcoOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [esgotadoPending, setEsgotadoPending] = useState<Product | null>(null);
  const { playFeedback } = useFeedback();
  const { data: stockMap } = useProductStockMap();

  const isEsgotado = (id: string) => isProductEsgotado(stockMap, id);

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

  // Filtragem: busca global tem prioridade; senão, por categoria.
  const filteredRaw = useMemo(() => {
    if (isSearching) {
      const q = search.trim().toLowerCase();
      return products.filter(
        (p) =>
          !HIDDEN_ESPETO_NAMES.includes(p.name.toLowerCase()) &&
          p.name.toLowerCase().includes(q)
      );
    }
    return products.filter((p) => {
      if (p.category !== activeCategory) return false;
      if (activeCategory === "espetos" && HIDDEN_ESPETO_NAMES.includes(p.name.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [products, activeCategory, isSearching, search]);

  const filtered = isSearching
    ? filteredRaw
    : sortByPersistedOrder(filteredRaw, orderMap[activeCategory] ?? null);

  const subgroups = !isSearching ? SUBGROUPS[activeCategory] : undefined;

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

  // Variantes reais do grupo Porco (Porco, Panceta suína, Costela suína).
  const porcoVariants = useMemo(() => getPorcoGroupProducts(products), [products]);
  const porcoBase =
    porcoVariants.find((v) => v.name === "porco")?.product ??
    porcoVariants.find((v) => v.product)?.product ??
    null;
  const showPorcoCard = !isSearching && activeCategory === "espetos" && !!porcoBase;

  const getQty = (id: string) =>
    cart.filter((i) => i.product.id === id).reduce((sum, i) => sum + i.quantity, 0);

  const subgroupQty = (sub: Subgroup) =>
    filtered
      .filter((p) => matchesSubgroup(p, sub))
      .reduce((sum, p) => sum + getQty(p.id), 0);

  const subgroupProducts = openSubgroup
    ? filtered.filter((p) => matchesSubgroup(p, openSubgroup))
    : [];

  // Quantidade total no carrinho de qualquer variante de Porco (badge do card).
  const porcoVariantIds = new Set(
    porcoVariants.map((v) => v.product?.id).filter((id): id is string => !!id)
  );
  const porcoQty = cart
    .filter((i) => porcoVariantIds.has(i.product.id))
    .reduce((sum, i) => sum + i.quantity, 0);


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
          <div className="flex gap-0 overflow-x-auto no-scrollbar border-b border-border -mx-2.5 px-2.5">
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
                  className={`relative inline-flex min-w-[88px] items-center justify-center whitespace-nowrap px-4 py-3 pr-5 text-sm transition-colors ${
                    isActive
                      ? "text-foreground font-bold bg-foreground/[0.03]"
                      : "text-muted-foreground font-semibold hover:text-foreground"
                  }`}
                >
                  <span>{CATEGORY_LABELS[cat]}</span>
                  {count > 0 && (
                    <span
                      key={count}
                      className={`absolute top-1 right-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none bg-primary text-primary-foreground ring-2 ring-background animate-badge-pop ${
                        isActive ? "scale-110 shadow-glow" : ""
                      }`}
                    >
                      {count}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-full bg-brand-gradient" />
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

        {!isLoading && !error && products.length > 0 && filtered.length === 0 && !subgroups && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {isSearching
              ? `Nenhum item encontrado para "${search}".`
              : "Nenhum item nesta categoria."}
          </p>
        )}

        {!isLoading && !error && products.length > 0 && (subgroups ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-2">
            {subgroups.map((sub) => {
              const qty = subgroupQty(sub);
              return (
                <button
                  key={sub.label}
                  onClick={() => {
                    playFeedback("click");
                    setOpenSubgroup(sub);
                  }}
                  className="relative flex aspect-square flex-col items-center justify-center rounded-lg bg-card border border-border p-3 text-center transition-all duration-150 active:scale-[0.96]"
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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-2">
            {/* Card especial "Porco" — abre popup com 3 variantes */}
            {showPorcoCard && (
              <button
                key="__porco_card__"
                onClick={() => {
                  playFeedback("click");
                  setPorcoOpen(true);
                }}
                className="relative flex flex-col rounded-lg bg-card border border-border p-3 text-left transition-all duration-150 active:scale-[0.96]"
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
              .filter((p) => !(showPorcoCard && porcoBase && p.id === porcoBase.id))
              .map((product) => {
                const qty = getQty(product.id);
                const esgotado = isEsgotado(product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => handleAdd(product)}
                    className={`relative flex flex-col rounded-2xl border p-3 text-left transition-all duration-150 active:scale-[0.94] shadow-soft hover:shadow-card ${
                      esgotado
                        ? "bg-card/60 border-destructive/40 hover:border-destructive/60"
                        : "bg-card border-border active:bg-primary/10 hover:border-primary/40"
                    }`}
                  >
                    <span className={`font-semibold text-base leading-tight ${esgotado ? "text-muted-foreground" : "text-foreground"}`}>
                      {product.name}
                    </span>
                    <span className={`mt-1 text-sm font-black ${esgotado ? "text-muted-foreground" : "brand-gradient-text"}`}>
                      R$ {product.price.toFixed(2)}
                    </span>
                    {esgotado && (
                      <span className="mt-1 inline-flex w-fit items-center rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-destructive border border-destructive/40">
                        Esgotado
                      </span>
                    )}
                    <span className={`mt-auto pt-2 inline-flex items-center gap-1 text-base font-black ${esgotado ? "text-destructive" : "text-primary"}`}>
                      {esgotado ? "+ Adicionar" : "+ ADD"}
                    </span>
                    {qty > 0 && (
                      <span
                        key={qty}
                        className="absolute -top-2 -right-2 flex h-7 min-w-[28px] items-center justify-center rounded-full bg-brand-gradient text-sm font-black text-primary-foreground border-2 border-background px-1.5 shadow-glow animate-badge-pop"
                      >
                        {qty}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        ))}
      </div>

      <PorcoVariantDialog
        open={porcoOpen}
        onOpenChange={setPorcoOpen}
        variants={porcoVariants.map((v) => ({
          name: v.name === "porco" ? "Porco" : v.name === "panceta suína" ? "Panceta suína" : "Costela suína",
          product: v.product,
        }))}
        isEsgotado={isEsgotado}
        getQty={getQty}
        onPick={(_name, product) => {
          setPorcoOpen(false);
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

      <SubgroupDialog
        subgroup={openSubgroup}
        products={subgroupProducts}
        onClose={() => setOpenSubgroup(null)}
        onAdd={handleAdd}
        getQty={getQty}
        isEsgotado={isEsgotado}
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
