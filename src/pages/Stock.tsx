import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Search, Download, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import StockList from "@/components/stock/StockList";
import MovementDialog from "@/components/stock/MovementDialog";
import ItemFormDialog from "@/components/stock/ItemFormDialog";
import HistoryDialog from "@/components/stock/HistoryDialog";
import ImportFromMenuDialog from "@/components/stock/ImportFromMenuDialog";
import CriticalStockSection, { getCriticalItems } from "@/components/stock/CriticalStockSection";
import { useInventoryItems, useBulkImportFromMenu } from "@/hooks/use-inventory";
import { useAutoSyncMenuToStock } from "@/hooks/use-auto-sync-menu-to-stock";
import { useMenuProductsForStock } from "@/hooks/use-menu-products-for-stock";
import { ProductGroupBanner } from "@/components/stock/ProductGroupBanner";
import { useProductGroups, getGroupsForCategory } from "@/lib/product-groups";
import { toast } from "@/hooks/use-toast";
import {
  type InventoryItem,
  DISPLAY_CATEGORIES,
  DISPLAY_CATEGORY_LABELS,
  getDisplayCategory,
  getStockStatus,
  slugify,
} from "@/lib/inventory";

const CRITICAL = "__critical__";

export default function Stock() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: items = [], isLoading } = useInventoryItems();
  const { data: menuProducts = [] } = useMenuProductsForStock();
  const { data: productGroups = [] } = useProductGroups();
  const bulkImport = useBulkImportFromMenu();
  useAutoSyncMenuToStock();

  const createInventoryForProduct = async (product: { id: string; name: string; category: string }) => {
    try {
      await bulkImport.mutateAsync([product]);
      toast({ title: `${product.name} criado no estoque` });
    } catch (e: any) {
      toast({ title: "Erro ao criar", description: e.message, variant: "destructive" });
    }
  };

  const pendingMenu = useMemo(
    () => menuProducts.filter((p) => !p.linked && p.active).length,
    [menuProducts]
  );

  // product_id -> category map (for resolving display category of linked items)
  const productCategoryById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of menuProducts) m.set(p.id, p.category);
    return m;
  }, [menuProducts]);

  const filterParam = searchParams.get("filter");
  const initialTab =
    filterParam === "low" || filterParam === "critical" ? CRITICAL : "espetos";

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<string>(initialTab);

  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<"in" | "out" | "adjustment">("in");
  const [movementOpen, setMovementOpen] = useState(false);

  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (filterParam === "low" || filterParam === "critical") setTab(CRITICAL);
  }, [filterParam]);

  const active = useMemo(() => items.filter((i) => i.is_active), [items]);

  // Annotate items with their display category once
  const itemsWithCat = useMemo(
    () => active.map((i) => ({ item: i, displayCat: getDisplayCategory(i, productCategoryById) })),
    [active, productCategoryById]
  );

  const summary = useMemo(() => {
    return {
      total: active.length,
      negative: active.filter((i) => getStockStatus(i) === "negative").length,
      low: active.filter((i) => getStockStatus(i) === "low").length,
      zero: active.filter((i) => getStockStatus(i) === "zero").length,
    };
  }, [active]);

  const criticalCount = useMemo(() => getCriticalItems(active).length, [active]);

  // Per-display-category counts (total + critical)
  const categoryStats = useMemo(() => {
    const m: Record<string, { total: number; critical: number }> = {};
    for (const { item, displayCat } of itemsWithCat) {
      const e = (m[displayCat] ??= { total: 0, critical: 0 });
      e.total += 1;
      const s = getStockStatus(item);
      if (s === "negative" || s === "zero" || s === "low") e.critical += 1;
    }
    return m;
  }, [itemsWithCat]);

  // Only show display categories that have at least one item
  const visibleDisplayCategories = useMemo(
    () => DISPLAY_CATEGORIES.filter((c) => (categoryStats[c]?.total ?? 0) > 0),
    [categoryStats]
  );

  const applySearch = (list: InventoryItem[]): InventoryItem[] => {
    const q = slugify(search);
    if (!q) return list;
    return list.filter(
      (i) =>
        i.slug.includes(q) ||
        slugify(i.name).includes(q) ||
        i.aliases.some((a) => a.includes(q))
    );
  };

  const visibleItems = useMemo(() => {
    if (tab === CRITICAL) return applySearch(getCriticalItems(active));
    const inCat = itemsWithCat.filter((x) => x.displayCat === tab).map((x) => x.item);
    return applySearch(inCat);
  }, [active, itemsWithCat, tab, search]);

  const openMovement = (item: InventoryItem, type: "in" | "out" | "adjustment") => {
    setMovementItem(item);
    setMovementType(type);
    setMovementOpen(true);
  };
  const openEdit = (item: InventoryItem | null) => {
    setEditItem(item);
    setEditOpen(true);
  };
  const openHistory = (item: InventoryItem) => {
    setHistoryItem(item);
    setHistoryOpen(true);
  };

  return (
    <div className="flex h-screen-safe flex-col overflow-hidden bg-background">
      {/* Header — PALM-style glass card */}
      <div className="shrink-0 glass-card p-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 mb-1.5">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold flex-1">Estoque</h1>
          <Button
            onClick={() => setImportOpen(true)}
            size="sm"
            variant="outline"
            title={pendingMenu === 0 ? "Tudo sincronizado" : `${pendingMenu} produtos novos no cardápio`}
          >
            <Download className="h-4 w-4 mr-1" />
            Re-importar{pendingMenu > 0 ? ` (${pendingMenu})` : ""}
          </Button>
          <Button onClick={() => openEdit(null)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-1.5 group">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            inputMode="search"
            placeholder="Buscar item no estoque..."
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

        {/* Category tabs — PALM style */}
        <div className="flex gap-0 overflow-x-auto no-scrollbar border-b border-border -mx-2.5 px-2.5">
          {/* Críticos tab — always first */}
          <button
            key={CRITICAL}
            onClick={() => setTab(CRITICAL)}
            className={`relative inline-flex min-w-[88px] items-center justify-center gap-1 whitespace-nowrap px-4 py-3 pr-5 text-sm transition-colors ${
              tab === CRITICAL
                ? "text-foreground font-bold bg-foreground/[0.03]"
                : "text-muted-foreground font-semibold hover:text-foreground"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Críticos</span>
            {criticalCount > 0 && (
              <span
                className={`absolute top-1 right-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none bg-destructive text-destructive-foreground ring-2 ring-background ${
                  tab === CRITICAL ? "scale-110 shadow-glow" : ""
                }`}
              >
                {criticalCount}
              </span>
            )}
            {tab === CRITICAL && (
              <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-full bg-brand-gradient" />
            )}
          </button>

          {visibleDisplayCategories.map((cat) => {
            const isActive = tab === cat;
            const stats = categoryStats[cat] ?? { total: 0, critical: 0 };
            const showCritical = stats.critical > 0;
            return (
              <button
                key={cat}
                onClick={() => setTab(cat)}
                className={`relative inline-flex min-w-[88px] items-center justify-center whitespace-nowrap px-4 py-3 pr-5 text-sm transition-colors ${
                  isActive
                    ? "text-foreground font-bold bg-foreground/[0.03]"
                    : "text-muted-foreground font-semibold hover:text-foreground"
                }`}
              >
                <span>{DISPLAY_CATEGORY_LABELS[cat]}</span>
                <span
                  className={`absolute top-1 right-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ring-2 ring-background ${
                    showCritical
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-muted text-muted-foreground"
                  } ${isActive ? "scale-110" : ""}`}
                >
                  {showCritical ? stats.critical : stats.total}
                </span>
                {isActive && (
                  <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-full bg-brand-gradient" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary ribbon */}
      <div className="shrink-0 px-4 py-1.5 text-[11px] text-muted-foreground border-b border-border flex flex-wrap gap-x-2 bg-card/40">
        <span>{summary.total} itens</span>
        {summary.negative > 0 && (
          <span className="text-destructive font-semibold">· {summary.negative} negativos</span>
        )}
        {summary.zero > 0 && (
          <span className="text-destructive font-semibold">· {summary.zero} zerados</span>
        )}
        {summary.low > 0 && (
          <span className="text-warning font-semibold">· {summary.low} baixos</span>
        )}
      </div>

      {/* Scrollable content */}
      <main className="flex-1 min-h-0 overflow-y-auto pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-12">Carregando...</p>
        ) : tab === CRITICAL ? (
          <div className="flex flex-col gap-4 p-2">
            <CriticalStockSection
              items={active}
              onRepor={(item) => openMovement(item, "in")}
            />
            <StockList
              items={visibleItems}
              onMovement={openMovement}
              onEdit={openEdit}
              onHistory={openHistory}
            />
          </div>
        ) : (
          <>
            {!search && getGroupsForCategory(productGroups, tab).map((g) => (
              <ProductGroupBanner
                key={g.id}
                group={g}
                items={active}
                onCreateForProduct={(p) =>
                  createInventoryForProduct({ id: p.id, name: p.name, category: p.category })
                }
              />
            ))}
            <StockList
              items={visibleItems}
              onMovement={openMovement}
              onEdit={openEdit}
              onHistory={openHistory}
            />
          </>
        )}
      </main>

      <MovementDialog
        open={movementOpen}
        onOpenChange={setMovementOpen}
        item={movementItem}
        type={movementType}
      />
      <ItemFormDialog open={editOpen} onOpenChange={setEditOpen} item={editItem} />
      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} item={historyItem} />
      <ImportFromMenuDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
