import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useUpsertInventoryItem, useDeactivateItem } from "@/hooks/use-inventory";
import {
  STOCK_CATEGORIES,
  STOCK_UNITS,
  slugify,
  type InventoryItem,
} from "@/lib/inventory";
import { toast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: InventoryItem | null;
};

export default function ItemFormDialog({ open, onOpenChange, item }: Props) {
  const isEdit = !!item;
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("outros");
  const [unit, setUnit] = useState<string>("unidade");
  const [initialStock, setInitialStock] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");

  const upsert = useUpsertInventoryItem();
  const deactivate = useDeactivateItem();

  const slug = useMemo(() => slugify(name), [name]);

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setCategory(item?.category ?? "outros");
      setUnit(item?.unit ?? "unidade");
      setInitialStock("0");
      setMinStock(String(item?.min_stock ?? 0));
      setAliases(item?.aliases ?? []);
      setAliasInput("");
    }
  }, [open, item]);

  const addAlias = () => {
    const v = slugify(aliasInput);
    if (v && !aliases.includes(v)) setAliases([...aliases, v]);
    setAliasInput("");
  };

  const removeAlias = (a: string) => setAliases(aliases.filter((x) => x !== a));

  const handleSave = async () => {
    if (!name.trim() || !slug) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        id: item?.id,
        name: name.trim(),
        slug,
        category,
        unit,
        aliases,
        min_stock: parseFloat(minStock.replace(",", ".")) || 0,
        current_stock: parseFloat(initialStock.replace(",", ".")) || 0,
      });
      toast({ title: isEdit ? "Item atualizado" : "Item criado" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleDeactivate = async () => {
    if (!item) return;
    if (!confirm(`Desativar ${item.name}?`)) return;
    await deactivate.mutateAsync(item.id);
    toast({ title: "Item desativado" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar item" : "Novo item"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            {slug && (
              <p className="text-[11px] text-muted-foreground mt-1">slug: {slug}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STOCK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STOCK_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!isEdit && (
              <div>
                <Label htmlFor="init">Estoque inicial</Label>
                <Input
                  id="init"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                />
              </div>
            )}
            <div className={isEdit ? "col-span-2" : ""}>
              <Label htmlFor="min">Estoque mínimo</Label>
              <Input
                id="min"
                type="number"
                inputMode="decimal"
                step="any"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Apelidos (para reconhecimento por bot)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addAlias();
                  }
                }}
                placeholder="ex: coca, coquinha"
              />
              <Button type="button" variant="secondary" onClick={addAlias}>
                Add
              </Button>
            </div>
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {aliases.map((a) => (
                  <Badge key={a} variant="secondary" className="gap-1">
                    {a}
                    <button onClick={() => removeAlias(a)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {isEdit && (
            <Button variant="destructive" onClick={handleDeactivate} className="mr-auto">
              Desativar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
