import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, MoreVertical, Pencil, Trash2, GripVertical } from "lucide-react";
import { Product } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Props {
  product: Product;
  onToggleActive: (id: string, current: boolean) => void;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (id: string) => void;
}

const SortableProductCard = ({
  product,
  onToggleActive,
  onEdit,
  onDelete,
  selectionMode = false,
  selected = false,
  onToggleSelected,
}: Props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.id, disabled: selectionMode });

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
      onClick={() => {
        if (selectionMode && onToggleSelected) onToggleSelected(product.id);
      }}
      className={`relative flex flex-col rounded-lg bg-card border p-4 text-left transition-all duration-150 ${
        !product.active ? "opacity-50 grayscale" : ""
      } ${
        selectionMode
          ? selected
            ? "border-primary ring-2 ring-primary cursor-pointer"
            : "border-border cursor-pointer hover:border-primary/50"
          : "border-border"
      }`}
    >
      {selectionMode ? (
        <div className="absolute top-2 left-2 pointer-events-none">
          <Checkbox checked={selected} className="h-5 w-5" />
        </div>
      ) : (
        <button
          {...attributes}
          {...listeners}
          className="absolute top-1.5 left-1.5 touch-none p-1 text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing"
          aria-label="Arrastar"
        >
          <GripVertical size={14} />
        </button>
      )}

      {!selectionMode && (
        <div className="absolute top-1 right-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
                aria-label="Mais ações"
              >
                <MoreVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(product)}>
                <Pencil size={14} className="mr-2" /> Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(product.id)}
                className="text-destructive focus:text-destructive admin-only"
              >
                <Trash2 size={14} className="mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="pt-4 pr-6 pl-4">
        <span className="block font-semibold text-base text-foreground leading-tight truncate">
          {product.name}
        </span>
        <span className="mt-1 block text-sm text-primary font-bold">
          R$ {product.price.toFixed(2)}
        </span>
      </div>

      <button
        onClick={(e) => {
          if (selectionMode) return;
          e.stopPropagation();
          onToggleActive(product.id, !!product.active);
        }}
        disabled={selectionMode}
        className={`mt-3 flex items-center justify-center gap-2 rounded-md py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
          product.active
            ? "bg-primary/10 text-primary hover:bg-primary/20"
            : "bg-destructive/10 text-destructive hover:bg-destructive/20"
        } ${selectionMode ? "opacity-60" : ""}`}
      >
        {product.active ? (
          <>
            <Eye size={14} /> Visível
          </>
        ) : (
          <>
            <EyeOff size={14} /> Oculto
          </>
        )}
      </button>
    </div>
  );
};

export default SortableProductCard;
