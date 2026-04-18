import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Product } from "@/lib/types";

interface Props {
  product: Product;
  onToggleActive: (id: string, current: boolean) => void;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
}

const SortableProductCard = ({ product, onToggleActive, onEdit, onDelete }: Props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between rounded-xl bg-white border border-border p-4 shadow-sm transition-all hover:shadow-md ${
        !product.active ? "opacity-60 bg-slate-50 grayscale-[0.5]" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="touch-none mr-2 p-2 -ml-2 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing"
        aria-label="Arrastar para reordenar"
      >
        <GripVertical size={18} />
      </button>
      <div className="flex-1 min-w-0 pr-2">
        <p className="font-bold text-base truncate text-slate-900">{product.name}</p>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">
          R$ {product.price.toFixed(2)}
          {!product.active && <span className="text-destructive ml-1">• INATIVO</span>}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          checked={product.active}
          onCheckedChange={() => onToggleActive(product.id, !!product.active)}
        />
        <div className="flex items-center gap-2 border-l border-border pl-3">
          <button
            onClick={() => onEdit(product)}
            className="p-2.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => onDelete(product.id)}
            className="p-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default SortableProductCard;
