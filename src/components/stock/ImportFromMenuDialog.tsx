import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useMenuProductsForStock } from "@/hooks/use-menu-products-for-stock";
import { useBulkImportFromMenu } from "@/hooks/use-inventory";
import { mapMenuCategoryToStock } from "@/lib/inventory";
import { toast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

type Step = "select" | "preview";

export default function ImportFromMenuDialog({ open, onOpenChange }: Props) {
  const { data: products = [], isLoading } = useMenuProductsForStock();
  const importMut = useBulkImportFromMenu();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hideInactive, setHideInactive] = useState(true);
  const [step, setStep] = useState<Step>("select");

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setStep("select");
      setHideInactive(true);
    }
  }, [open]);

  const available = useMemo(
    () => products.filter((p) => !p.linked && (!hideInactive || p.active)),
    [products, hideInactive]
  );
  const linkedCount = useMemo(() => products.filter((p) => p.linked).length, [products]);

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

  const selectAll = () => setSelected(new Set(available.map((p) => p.id)));
  const clearAll = () => setSelected(new Set());

  const toCreate = useMemo(
    () => available.filter((p) => selected.has(p.id)),
    [available, selected]
  );
  const toIgnore = useMemo(
    () => products.filter((p) => p.linked && selected.has(p.id)),
    [products, selected]
  );

  const handleImport = async () => {
    if (toCreate.length === 0) return;
    try {
      const r = await importMut.mutateAsync(toCreate);
      toast({ title: `${r.inserted} itens importados` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col h-[85vh] max-h-[85vh] p-0 gap-0 sm:max-w-lg">
        {step === "select" ? (
          <>
            <DialogHeader className="shrink-0 px-6 pt-6 pb-3 border-b border-border">
              <DialogTitle>Importar do cardápio</DialogTitle>
              <DialogDescription>
                {available.length} disponíveis · {linkedCount} já vinculados
              </DialogDescription>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={selectAll} disabled={available.length === 0}>
                  Selecionar todos
                </Button>
                <Button size="sm" variant="outline" onClick={clearAll} disabled={selected.size === 0}>
                  Limpar
                </Button>
                <label className="flex items-center gap-2 text-xs text-muted-foreground ml-auto cursor-pointer">
                  <Checkbox
                    checked={hideInactive}
                    onCheckedChange={(v) => setHideInactive(!!v)}
                  />
                  ocultar inativos
                </label>
              </div>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
              ) : available.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Todos os produtos do cardápio já estão vinculados.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
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
            </div>

            <div className="shrink-0 flex gap-2 px-6 py-3 border-t border-border bg-background">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={() => setStep("preview")}
                disabled={selected.size === 0}
                className="flex-1"
              >
                Pré-visualizar {selected.size > 0 ? `(${selected.size})` : ""}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="shrink-0 px-6 pt-6 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 -ml-2"
                  onClick={() => setStep("select")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle>Confirmar importação</DialogTitle>
              </div>
              <DialogDescription>
                Revise os itens antes de criar no estoque.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3 space-y-5">
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-success mb-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Serão criados ({toCreate.length})
                </h3>
                {toCreate.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-6">Nenhum item novo selecionado.</p>
                ) : (
                  <ul className="flex flex-col gap-1 pl-6">
                    {toCreate.map((p) => (
                      <li key={p.id} className="text-sm flex items-baseline gap-2">
                        <span className="flex-1">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">
                          → {mapMenuCategoryToStock(p.category)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {toIgnore.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
                    <XCircle className="h-4 w-4" />
                    Ignorados — já vinculados ({toIgnore.length})
                  </h3>
                  <ul className="flex flex-col gap-1 pl-6">
                    {toIgnore.map((p) => (
                      <li key={p.id} className="text-sm text-muted-foreground">
                        {p.name} <span className="text-[10px]">(já existe no estoque)</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className="shrink-0 flex gap-2 px-6 py-3 border-t border-border bg-background">
              <Button variant="outline" onClick={() => setStep("select")} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button
                onClick={handleImport}
                disabled={toCreate.length === 0 || importMut.isPending}
                className="flex-1"
              >
                Importar {toCreate.length} {toCreate.length === 1 ? "item" : "itens"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
