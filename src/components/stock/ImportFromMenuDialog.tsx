import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMenuProductsForStock } from "@/hooks/use-menu-products-for-stock";
import { useBulkImportFromMenu } from "@/hooks/use-inventory";
import { toast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export default function ImportFromMenuDialog({ open, onOpenChange }: Props) {
  const { data: products = [], isLoading } = useMenuProductsForStock();
  const importMut = useBulkImportFromMenu();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const available = useMemo(() => products.filter((p) => !p.linked), [products]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof available>();
    for (const p of available) {
      const k = p.category || "outros";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [available]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleCategory = (ids: string[]) => {
    const allSelected = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    if (allSelected) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    setSelected(next);
  };

  const handleImport = async () => {
    const toImport = available.filter((p) => selected.has(p.id));
    if (toImport.length === 0) return;
    try {
      const r = await importMut.mutateAsync(toImport);
      toast({ title: `${r.inserted} itens importados` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar do cardápio</DialogTitle>
          <DialogDescription>
            Cria itens de estoque vinculados aos produtos do cardápio. Estoque inicial e mínimo ficam em 0.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6 max-h-[55vh]">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
          ) : available.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Todos os produtos do cardápio já estão vinculados.
            </p>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              {grouped.map(([cat, items]) => {
                const ids = items.map((i) => i.id);
                const allSelected = ids.every((id) => selected.has(id));
                return (
                  <div key={cat}>
                    <button
                      onClick={() => toggleCategory(ids)}
                      className="text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground mb-2"
                    >
                      {cat} ({items.length}) — {allSelected ? "desmarcar" : "marcar todos"}
                    </button>
                    <div className="flex flex-col gap-1">
                      {items.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            checked={selected.has(p.id)}
                            onCheckedChange={() => toggle(p.id)}
                          />
                          <span className="text-sm flex-1">{p.name}</span>
                          {!p.active && (
                            <span className="text-[10px] text-muted-foreground uppercase">
                              inativo
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={selected.size === 0 || importMut.isPending}
          >
            Importar {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
