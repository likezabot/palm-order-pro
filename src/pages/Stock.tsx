import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Search, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import StockList from "@/components/stock/StockList";
import MovementDialog from "@/components/stock/MovementDialog";
import ItemFormDialog from "@/components/stock/ItemFormDialog";
import HistoryDialog from "@/components/stock/HistoryDialog";
import ImportFromMenuDialog from "@/components/stock/ImportFromMenuDialog";
import CriticalStockSection, { getCriticalItems } from "@/components/stock/CriticalStockSection";
import { useInventoryItems } from "@/hooks/use-inventory";
import { useAutoSyncMenuToStock } from "@/hooks/use-auto-sync-menu-to-stock";
import { useMenuProductsForStock } from "@/hooks/use-menu-products-for-stock";
import {
  type InventoryItem,
  STOCK_CATEGORIES,
  getStockStatus,
  slugify,
} from "@/lib/inventory";

const CRITICAL = "__critical__";
const ALL = "all";

export default function Stock() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: items = [], isLoading } = useInventoryItems();
  const { data: menuProducts = [] } = useMenuProductsForStock();
  useAutoSyncMenuToStock();
  const pendingMenu = useMemo(
    () => menuProducts.filter((p) => !p.linked && p.active).length,
    [menuProducts]
  );

  const filterParam = searchParams.get("filter");
  const initialTab =
    filterParam === "low" || filterParam === "critical" ? CRITICAL : ALL;

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

  const summary = useMemo(() => {
    return {
      total: active.length,
      negative: active.filter((i) => getStockStatus(i) === "negative").length,
      low: active.filter((i) => getStockStatus(i) === "low").length,
      zero: active.filter((i) => getStockStatus(i) === "zero").length,
    };
  }, [active]);

  const criticalCount = useMemo(() => getCriticalItems(active).length, [active]);

  // Categories present in the inventory (only show tabs that have items)
  const usedCategories = useMemo(() => {
    const set = new Set(active.map((i) => i.category));
    return STOCK_CATEGORIES.filter((c) => set.has(c));
  }, [active]);

  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of active) m[i.category] = (m[i.category] ?? 0) + 1;
    return m;
  }, [active]);

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
    if (tab === ALL) return applySearch(active);
    return applySearch(active.filter((i) => i.category === tab));
  }, [active, tab, search]);

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
    <div className="min-h-screen-safe bg-background pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold flex-1">Estoque</h1>
          <Button onClick={() => setImportOpen(true)} size="sm" variant="outline">
            <Download className="h-4 w-4 mr-1" /> Cardápio
          </Button>
          <Button onClick={() => openEdit(null)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </header>

      <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border flex flex-wrap gap-x-2">
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

      <main className="p-4">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-12">Carregando...</p>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto gap-1">
              <TabsTrigger value={CRITICAL} className="gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Críticos
                {criticalCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-4 px-1">
                    {criticalCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value={ALL}>
                Todas <span className="ml-1 text-muted-foreground">({active.length})</span>
              </TabsTrigger>
              {usedCategories.map((c) => (
                <TabsTrigger key={c} value={c} className="capitalize">
                  {c}{" "}
                  <span className="ml-1 text-muted-foreground">({categoryCounts[c]})</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={CRITICAL} className="mt-4 flex flex-col gap-4">
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
            </TabsContent>

            <TabsContent value={ALL} className="mt-4">
              <StockList
                items={visibleItems}
                onMovement={openMovement}
                onEdit={openEdit}
                onHistory={openHistory}
              />
            </TabsContent>

            {usedCategories.map((c) => (
              <TabsContent key={c} value={c} className="mt-4">
                <StockList
                  items={visibleItems}
                  onMovement={openMovement}
                  onEdit={openEdit}
                  onHistory={openHistory}
                />
              </TabsContent>
            ))}
          </Tabs>
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
