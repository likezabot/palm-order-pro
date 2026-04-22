import StockCard from "./StockCard";
import type { InventoryItem } from "@/lib/inventory";

type Props = {
  items: InventoryItem[];
  onMovement: (item: InventoryItem, type: "in" | "out" | "adjustment") => void;
  onEdit: (item: InventoryItem) => void;
  onHistory: (item: InventoryItem) => void;
};

export default function StockList({ items, onMovement, onEdit, onHistory }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Nenhum item encontrado.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-2">
      {items.map((item) => (
        <StockCard
          key={item.id}
          item={item}
          onMovement={onMovement}
          onEdit={onEdit}
          onHistory={onHistory}
        />
      ))}
    </div>
  );
}
