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
import { X, Link2, Unlink } from "lucide-react";
import { useUpsertInventoryItem, useDeactivateItem } from "@/hooks/use-inventory";
import { useMenuProductsForStock } from "@/hooks/use-menu-products-for-stock";
import {
  STOCK_CATEGORIES,
  STOCK_UNITS,
  slugify,
  mapMenuCategoryToStock,
  type InventoryItem,
} from "@/lib/inventory";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  PORCO_GROUP_NAMES,
  PORCO_EXTRA_NAMES_KEY,
  addPorcoExtraName,
  useExtraPorcoNames,
} from "@/lib/porco-group";

const normName = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const isCanonicalPorcoName = (name: string) =>
  PORCO_GROUP_NAMES.some((n) => normName(n) === normName(name));

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: InventoryItem | null;
};

const NONE_VALUE = "__none__";

export default function ItemFormDialog({ open, onOpenChange, item }: Props) {
  const isEdit = !!item;
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("outros");
  const [unit, setUnit] = useState<string>("unidade");
  const [initialStock, setInitialStock] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");
  const [productId, setProductId] = useState<string | null>(null);

  const upsert = useUpsertInventoryItem();
  const deactivate = useDeactivateItem();
  const { data: menuProducts = [] } = useMenuProductsForStock();

  const slug = useMemo(() => slugify(name), [name]);

  // Products available to link: not yet linked OR currently linked to this item
  const linkableProducts = useMemo(() => {
    return menuProducts.filter((p) => !p.linked || p.id === item?.product_id);
  }, [menuProducts, item?.product_id]);

  const linkedProduct = useMemo(
    () => menuProducts.find((p) => p.id === productId) ?? null,
    [menuProducts, productId]
  );

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setCategory(item?.category ?? "outros");
      setUnit(item?.unit ?? "unidade");
      setInitialStock("0");
      setMinStock(String(item?.min_stock ?? 0));
      setAliases(item?.aliases ?? []);
      setAliasInput("");
      setProductId(item?.product_id ?? null);
    }
  }, [open, item]);

  const handleSelectProduct = (val: string) => {
    if (val === NONE_VALUE) {
      setProductId(null);
      return;
    }
    const p = menuProducts.find((x) => x.id === val);
    if (!p) return;
    setProductId(p.id);
    // Pre-fill name/category from menu product
    if (!isEdit || !name.trim()) setName(p.name);
    setCategory(mapMenuCategoryToStock(p.category));
  };

  const addAlias = () => {
    const v = slugify(aliasInput);
    if (v && !aliases.includes(v)) setAliases([...aliases, v]);
    setAliasInput("");
  };

  const removeAlias = (a: string) => setAliases(aliases.filter((x) => x !== a));

  const handleSave = async () => {
    const finalName = linkedProduct ? linkedProduct.name : name.trim();
    if (!finalName || !slugify(finalName)) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        id: item?.id,
        name: finalName,
        slug: slugify(finalName),
        category,
        unit,
        aliases,
        min_stock: parseFloat(minStock.replace(",", ".")) || 0,
        current_stock: parseFloat(initialStock.replace(",", ".")) || 0,
        product_id: productId,
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
            <Label className="flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" /> Vincular a produto do cardápio (opcional)
            </Label>
            <div className="flex gap-2 mt-1">
              <Select value={productId ?? NONE_VALUE} onValueChange={handleSelectProduct}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Nenhum (insumo solto)</SelectItem>
                  {linkableProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{" "}
                      <span className="text-muted-foreground">({p.category})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {productId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setProductId(null)}
                  title="Desvincular"
                >
                  <Unlink className="h-4 w-4" />
                </Button>
              )}
            </div>
            {linkedProduct && (
              <p className="text-[11px] text-primary mt-1">
                Vinculado a {linkedProduct.name}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={linkedProduct ? linkedProduct.name : name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={!!linkedProduct}
            />
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
