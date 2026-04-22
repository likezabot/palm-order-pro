import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/hooks/use-feedback";
import { useToast } from "@/hooks/use-toast";
import {
  useProductGroups,
  useInvalidateProductGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  removeProductFromGroup,
  addProductToGroup,
  type ProductGroup,
} from "@/lib/product-groups";
import { CATEGORIES, CATEGORY_LABELS, type Product } from "@/lib/types";
import { Pencil, Trash2, Plus, X, Check } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productsByCategory: Record<string, Product[]>;
}

export const GroupsManager = ({ open, onOpenChange, productsByCategory }: Props) => {
  const { data: groups = [] } = useProductGroups();
  const invalidate = useInvalidateProductGroups();
  const { toast } = useToast();
  const { playFeedback } = useFeedback();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Edit/create form fields
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [category, setCategory] = useState<string>("espetos");
  const [trigger, setTrigger] = useState("");

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setCreating(false);
    }
  }, [open]);

  const startCreate = () => {
    setCreating(true);
    setEditingId(null);
    setName("");
    setIcon("📦");
    setCategory("espetos");
    setTrigger("");
  };

  const startEdit = (g: ProductGroup) => {
    setEditingId(g.id);
    setCreating(false);
    setName(g.name);
    setIcon(g.icon);
    setCategory(g.category);
    setTrigger(g.trigger_product_name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCreating(false);
  };

  const save = async () => {
    if (!name.trim() || !trigger.trim()) {
      toast({ title: "Nome e gatilho são obrigatórios", variant: "destructive" });
      return;
    }
    playFeedback("click");
    try {
      if (creating) {
        await createGroup({
          name: name.trim(),
          icon: icon.trim() || "📦",
          category,
          trigger_product_name: trigger.trim(),
          member_names: [trigger.trim()],
        });
        toast({ title: "Grupo criado" });
      } else if (editingId) {
        await updateGroup(editingId, {
          name: name.trim(),
          icon: icon.trim() || "📦",
          category,
          trigger_product_name: trigger.trim(),
        });
        toast({ title: "Grupo atualizado" });
      }
      await invalidate();
      cancelEdit();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" });
    }
  };

  const remove = async (g: ProductGroup) => {
    if (!confirm(`Excluir grupo "${g.name}"? Os produtos NÃO são apagados, só voltam a aparecer soltos na grade.`)) return;
    playFeedback("click");
    await deleteGroup(g.id);
    await invalidate();
    toast({ title: "Grupo excluído" });
  };

  const toggleMember = async (g: ProductGroup, productName: string, isMember: boolean) => {
    if (isMember) await removeProductFromGroup(g.id, productName);
    else await addProductToGroup(g.id, productName);
    await invalidate();
  };

  const editingGroup = editingId ? groups.find((g) => g.id === editingId) ?? null : null;
  const formCategory = creating || editingGroup ? category : "espetos";
  const productsInCategory = productsByCategory[formCategory] ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar grupos / popups</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Grupos agrupam produtos de uma mesma categoria sob um único card no PALM.
          Tocar no card abre um popup com todos os membros.
        </p>

        {!creating && !editingId && (
          <div className="space-y-2">
            {groups.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                Nenhum grupo criado.
              </p>
            ) : (
              groups.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl">{g.icon}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">{g.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {CATEGORY_LABELS[g.category] ?? g.category} · gatilho: {g.trigger_product_name} ·{" "}
                        {g.member_names.length} {g.member_names.length === 1 ? "membro" : "membros"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(g)} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(g)}
                      title="Excluir"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
            <Button onClick={startCreate} className="w-full mt-2">
              <Plus className="h-4 w-4 mr-1" /> Criar novo grupo
            </Button>
          </div>
        )}

        {(creating || editingId) && (
          <div className="space-y-3">
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                  Ícone
                </label>
                <Input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="text-center text-lg" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                  Nome do grupo
                </label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Refri 350ml" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Categoria
              </label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-lg border p-2 text-xs font-bold transition-colors ${
                      category === c
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Produto-gatilho (aparece no card do PALM)
              </label>
              <Input
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                placeholder="Ex: Refri 350ml"
                list="trigger-products"
              />
              <datalist id="trigger-products">
                {productsInCategory.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
              <p className="text-[10px] text-muted-foreground mt-1">
                Deve corresponder ao nome de um produto existente nesta categoria.
              </p>
            </div>

            {editingGroup && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                  Membros do popup
                </label>
                <div className="rounded-lg border border-border bg-card p-2 max-h-48 overflow-y-auto">
                  {productsInCategory.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">
                      Nenhum produto nesta categoria.
                    </p>
                  ) : (
                    productsInCategory.map((p) => {
                      const isMember = editingGroup.member_names.some(
                        (m) => m.toLowerCase().trim() === p.name.toLowerCase().trim()
                      );
                      return (
                        <button
                          key={p.id}
                          onClick={() => toggleMember(editingGroup, p.name, isMember)}
                          className={`w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                            isMember ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                          {isMember ? (
                            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={cancelEdit} className="flex-1">
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
              <Button onClick={save} className="flex-1">
                <Check className="h-4 w-4 mr-1" /> Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
