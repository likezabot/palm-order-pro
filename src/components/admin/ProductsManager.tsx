import { useMemo, useState } from "react";
import { Plus, ArrowDownAZ, Search, X, CheckSquare, Package, Layers } from "lucide-react";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  SensorDescriptor,
  SensorOptions,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { Product, CATEGORIES, CATEGORY_LABELS } from "@/lib/types";
import SortableProductCard from "./SortableProductCard";
import BulkActionsBar from "./BulkActionsBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFeedback } from "@/hooks/use-feedback";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ProductGroupBanner } from "./ProductGroupBanner";
import { GroupsManager } from "./GroupsManager";
import { useProductGroups, getGroupsForCategory } from "@/lib/product-groups";

interface Props {
  productsByCategory: Record<string, Product[]>;
  orderMap: Record<string, string[] | null>;
  sensors: SensorDescriptor<SensorOptions>[];
  onDragEnd: (cat: string, e: DragEndEvent) => void;
  onResetOrder: (cat: string) => void;
  onToggleActive: (id: string, current: boolean) => void;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onNewProduct: (cat: string) => void;
}

type StatusFilter = "all" | "active" | "inactive";

const ProductsManager = ({
  productsByCategory,
  orderMap,
  sensors,
  onDragEnd,
  onResetOrder,
  onToggleActive,
  onEdit,
  onDelete,
  onNewProduct,
}: Props) => {
  const [activeCategory, setActiveCategory] = useState<string>("espetos");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupsManagerOpen, setGroupsManagerOpen] = useState(false);
  const { playFeedback } = useFeedback();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: productGroups = [] } = useProductGroups();
  const groupsForActiveCategory = useMemo(
    () => getGroupsForCategory(productGroups, activeCategory),
    [productGroups, activeCategory],
  );

  const min = parseFloat(minPrice);
  const max = parseFloat(maxPrice);
  const hasFilters = !!search || statusFilter !== "all" || !isNaN(min) || !isNaN(max);

  const matchesFilters = (p: Product) => {
    if (statusFilter === "active" && !p.active) return false;
    if (statusFilter === "inactive" && p.active) return false;
    if (!isNaN(min) && p.price < min) return false;
    if (!isNaN(max) && p.price > max) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  };

  // When searching, show all categories. Otherwise only active category.
  const filteredByCategory = useMemo(() => {
    const result: Record<string, Product[]> = {};
    const cats = search ? [...CATEGORIES] : [activeCategory];
    cats.forEach((c) => {
      result[c] = (productsByCategory[c] ?? []).filter(matchesFilters);
    });
    return result;
  }, [productsByCategory, activeCategory, search, statusFilter, minPrice, maxPrice]);

  const items = filteredByCategory[activeCategory] ?? [];
  const hasCustomOrder = (orderMap[activeCategory]?.length ?? 0) > 0;

  const allFilteredIds = useMemo(
    () => Object.values(filteredByCategory).flat().map((p) => p.id),
    [filteredByCategory],
  );

  const toggleSelected = (id: string) => {
    playFeedback("click");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setMinPrice("");
    setMaxPrice("");
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const bulkSetActive = async (active: boolean) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    playFeedback("click");
    const { withPin } = await import("@/lib/manager-pin");
    const ok = await withPin(async (pin) => {
      const { error } = await supabase.rpc("admin_bulk_set_active", {
        p_pin: pin,
        p_ids: ids,
        p_active: active,
      });
      if (error) throw error;
      return true;
    }, active ? "Ativar produtos em lote" : "Ocultar produtos em lote");
    if (!ok) {
      toast({ variant: "destructive", title: "Erro ao atualizar" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    toast({ title: `${ids.length} ${active ? "ativados" : "ocultados"}` });
    exitSelection();
  };

  const bulkAdjustPrice = async (mode: "percent" | "fixed", value: number) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    playFeedback("click");

    let updates: Array<{ id: string; price: number }>;
    if (mode === "fixed") {
      updates = ids.map((id) => ({ id, price: Number(value.toFixed(2)) }));
    } else {
      const all = Object.values(productsByCategory).flat();
      const factor = 1 + value / 100;
      updates = ids
        .map((id) => all.find((p) => p.id === id))
        .filter((p): p is Product => !!p)
        .map((p) => ({
          id: p.id,
          price: Math.max(0, Number((p.price * factor).toFixed(2))),
        }));
    }

    const { withPin } = await import("@/lib/manager-pin");
    const ok = await withPin(async (pin) => {
      const { error } = await supabase.rpc("admin_bulk_set_price", {
        p_pin: pin,
        p_updates: updates,
      });
      if (error) throw error;
      return true;
    }, "Ajustar preços em lote");
    if (!ok) {
      toast({ variant: "destructive", title: "Erro" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    toast({ title: `Preços atualizados em ${ids.length} itens` });
    exitSelection();
  };

  const renderGrid = (cat: string, list: Product[]) => (
    <div key={cat}>
      {search && (
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground px-1 mb-2 mt-3">
          {CATEGORY_LABELS[cat]}
          <Badge variant="secondary" className="font-medium tabular-nums">{list.length}</Badge>
        </h3>
      )}
      {selectionMode ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((product) => (
            <SortableProductCard
              key={product.id}
              product={product}
              onToggleActive={onToggleActive}
              onEdit={onEdit}
              onDelete={onDelete}
              selectionMode
              selected={selectedIds.has(product.id)}
              onToggleSelected={toggleSelected}
            />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => onDragEnd(cat, e)}
        >
          <SortableContext items={list.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {list.map((product) => (
                <SortableProductCard
                  key={product.id}
                  product={product}
                  onToggleActive={onToggleActive}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1">
      {/* Toolbar de busca + filtros */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-3 space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-0 basis-full sm:basis-auto sm:min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto…"
              className="pl-9 h-10"
            />
          </div>
          <div className="flex gap-1 rounded-lg bg-card border border-border p-1">
            {(["all", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { playFeedback("click"); setStatusFilter(s); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "all" ? "Todos" : s === "active" ? "Visíveis" : "Ocultos"}
              </button>
            ))}
          </div>
          <div className="flex gap-1 items-center">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="R$ min"
              className="h-10 w-24"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="R$ máx"
              className="h-10 w-24"
            />
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
            >
              <X size={12} /> Limpar
            </button>
          )}
          <button
            onClick={() => {
              playFeedback("click");
              if (selectionMode) exitSelection();
              else setSelectionMode(true);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              selectionMode
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-foreground hover:bg-secondary"
            }`}
          >
            <CheckSquare size={14} /> {selectionMode ? "Cancelar" : "Selecionar"}
          </button>
        </div>

        {/* Tabs categoria — escondidos quando há busca ativa */}
        {!search && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {CATEGORIES.map((cat) => {
              const count = productsByCategory[cat]?.length ?? 0;
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    playFeedback("click");
                    setActiveCategory(cat);
                  }}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-150 ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground border border-border"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                  <span className={`ml-1.5 text-xs ${active ? "opacity-80" : "opacity-60"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Toolbar da categoria ativa (só sem busca) */}
      {!search && (
        <div className="flex items-center justify-between px-4 py-3 gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Toque em <strong className="text-foreground">Visível/Oculto</strong> para mostrar/esconder. Arraste pelo <strong className="text-foreground">⋮⋮</strong> para reordenar.
          </p>
          <div className="flex items-center gap-2">
            {hasCustomOrder && items.length > 1 && !selectionMode && (
              <button
                onClick={() => onResetOrder(activeCategory)}
                className="flex items-center gap-1.5 rounded-lg bg-secondary text-secondary-foreground px-3 py-2 text-xs font-bold hover:bg-secondary/80 transition-colors"
                title="Restaurar ordem alfabética"
              >
                <ArrowDownAZ size={14} /> A-Z
              </button>
            )}
            <button
              onClick={() => { playFeedback("click"); setGroupsManagerOpen(true); }}
              className="flex items-center gap-1.5 rounded-lg bg-card border border-border text-foreground px-3 py-2 text-xs font-bold hover:bg-secondary transition-colors"
              title="Gerenciar grupos / popups"
            >
              <Layers size={14} /> Grupos
            </button>
            <button
              onClick={() => onNewProduct(activeCategory)}
              className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              <Plus size={14} /> Novo
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className={`px-3 ${selectionMode ? "pb-28" : "pb-10"}`}>
        {!search && !hasFilters && groupsForActiveCategory.map((g) => (
          <ProductGroupBanner
            key={g.id}
            group={g}
            products={productsByCategory[activeCategory] ?? []}
          />
        ))}
        {search ? (
          // Modo busca: lista todas categorias com header
          allFilteredIds.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground bg-card rounded-xl border-2 border-dashed border-border">
              Nenhum produto encontrado.
            </div>
          ) : (
            CATEGORIES.map((cat) => {
              const list = filteredByCategory[cat] ?? [];
              return list.length > 0 ? renderGrid(cat, list) : null;
            })
          )
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground bg-card rounded-xl border-2 border-dashed border-border">
            {hasFilters
              ? "Nenhum produto corresponde aos filtros."
              : `Nenhum produto em ${CATEGORY_LABELS[activeCategory]}.`}
          </div>
        ) : (
          renderGrid(activeCategory, items)
        )}
      </div>

      {selectionMode && (
        <BulkActionsBar
          count={selectedIds.size}
          onShow={() => bulkSetActive(true)}
          onHide={() => bulkSetActive(false)}
          onAdjustPrice={bulkAdjustPrice}
          onCancel={exitSelection}
        />
      )}

      <GroupsManager
        open={groupsManagerOpen}
        onOpenChange={setGroupsManagerOpen}
        productsByCategory={productsByCategory}
      />
    </div>
  );
};

export default ProductsManager;
