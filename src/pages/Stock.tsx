import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import StockList from "@/components/stock/StockList";
import MovementDialog from "@/components/stock/MovementDialog";
import ItemFormDialog from "@/components/stock/ItemFormDialog";
import HistoryDialog from "@/components/stock/HistoryDialog";
import { useInventoryItems } from "@/hooks/use-inventory";
import {
  type InventoryItem,
  STOCK_CATEGORIES,
  getStockStatus,
  slugify,
} from "@/lib/inventory";

export default function Stock() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: items = [], isLoading } = useInventoryItems();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [onlyLow, setOnlyLow] = useState(searchParams.get("filter") === "low");

  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<"in" | "out" | "adjustment">("in");
  const [movementOpen, setMovementOpen] = useState(false);

  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("filter") === "low") setOnlyLow(true);
  }, [searchParams]);

  const filtered = useMemo(() => {
    const q = slugify(search);
    return items
      .filter((i) => i.is_active)
      .filter((i) => (category === "all" ? true : i.category === category))
      .filter((i) => {
        if (!onlyLow) return true;
        const s = getStockStatus(i);
        return s !== "ok";
      })
      .filter((i) => {
        if (!q) return true;
        return (
          i.slug.includes(q) ||
          slugify(i.name).includes(q) ||
          i.aliases.some((a) => a.includes(q))
        );
      });
  }, [items, search, category, onlyLow]);

  const summary = useMemo(() => {
    const active = items.filter((i) => i.is_active);
    return {
      total: active.length,
      low: active.filter((i) => getStockStatus(i) === "low").length,
      zero: active.filter((i) => getStockStatus(i) === "zero").length,
    };
  }, [items]);

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
          <Button onClick={() => openEdit(null)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {STOCK_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-1">
            <Switch id="low" checked={onlyLow} onCheckedChange={setOnlyLow} />
            <Label htmlFor="low" className="cursor-pointer text-sm">Só baixos</Label>
          </div>
        </div>
      </header>

      <div className="px-4 py-3 text-xs text-muted-foreground border-b border-border">
        {summary.total} itens · {summary.low} baixos · {summary.zero} zerados
      </div>

      <main className="p-4">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-12">Carregando...</p>
        ) : (
          <StockList
            items={filtered}
            onMovement={openMovement}
            onEdit={openEdit}
            onHistory={openHistory}
          />
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
    </div>
  );
}
