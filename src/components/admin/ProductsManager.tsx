import { useState } from "react";
import { Plus, ArrowDownAZ } from "lucide-react";
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
import { useFeedback } from "@/hooks/use-feedback";

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
  const { playFeedback } = useFeedback();
  const items = productsByCategory[activeCategory] ?? [];
  const hasCustomOrder = (orderMap[activeCategory]?.length ?? 0) > 0;

  return (
    <div className="flex flex-col flex-1">
      {/* Tabs estilo Palm — pills horizontais */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-3">
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
      </div>

      {/* Toolbar da categoria ativa */}
      <div className="flex items-center justify-between px-4 py-3 gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Toque em <strong className="text-foreground">Visível/Oculto</strong> para mostrar ou esconder do cardápio. Arraste pelo <strong className="text-foreground">⋮⋮</strong> para reordenar.
        </p>
        <div className="flex items-center gap-2">
          {hasCustomOrder && items.length > 1 && (
            <button
              onClick={() => onResetOrder(activeCategory)}
              className="flex items-center gap-1.5 rounded-lg bg-secondary text-secondary-foreground px-3 py-2 text-xs font-bold hover:bg-secondary/80 transition-colors"
              title="Restaurar ordem alfabética"
            >
              <ArrowDownAZ size={14} /> A-Z
            </button>
          )}
          <button
            onClick={() => onNewProduct(activeCategory)}
            className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} /> Novo
          </button>
        </div>
      </div>

      {/* Card especial Porco (apenas em Espetos) */}
      {activeCategory === "espetos" && (
        <div className="px-3">
          <div className="flex items-center gap-3 rounded-lg bg-card border border-border p-3 mb-3">
            <span className="shrink-0 rounded-md bg-primary/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-primary">
              Popup
            </span>
            <div className="min-w-0">
              <p className="font-bold text-sm text-foreground leading-tight">Porco</p>
              <p className="text-[11px] text-muted-foreground truncate">
                Porco · Panceta suína · Costela suína
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Grid de cards */}
      <div className="px-3 pb-10">
        {items.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground bg-card rounded-xl border-2 border-dashed border-border">
            Nenhum produto em {CATEGORY_LABELS[activeCategory]}.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => onDragEnd(activeCategory, e)}
          >
            <SortableContext items={items.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {items.map((product) => (
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
    </div>
  );
};

export default ProductsManager;
