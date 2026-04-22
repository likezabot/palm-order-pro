import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Recipe = { id: string; product_id: string; ingredient_product_id: string };

interface Props {
  productId: string;
}

/**
 * Painel para refeições: lista ingredientes do estoque que, quando esgotados,
 * marcam o prato como ESGOTADO no PALM. Insere/remove em product_recipes.
 */
export default function ProductRecipesPanel({ productId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [picking, setPicking] = useState<string>("");

  // Produtos com estoque ativo (candidatos a ingrediente).
  const { data: stockedProducts = [] } = useQuery({
    queryKey: ["stocked-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items" as any)
        .select("product_id")
        .eq("is_active", true)
        .not("product_id", "is", null);
      if (error) throw error;
      const ids = Array.from(
        new Set(((data ?? []) as unknown as Array<{ product_id: string }>).map((r) => r.product_id)),
      );
      if (ids.length === 0) return [] as Array<{ id: string; name: string; category: string }>;
      const { data: prods, error: e2 } = await supabase
        .from("products")
        .select("id, name, category")
        .in("id", ids)
        .order("name");
      if (e2) throw e2;
      return (prods ?? []) as Array<{ id: string; name: string; category: string }>;
    },
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["product-recipes-for", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_recipes" as any)
        .select("id, product_id, ingredient_product_id")
        .eq("product_id", productId);
      if (error) throw error;
      return (data ?? []) as unknown as Recipe[];
    },
    enabled: !!productId,
  });

  const ingredientsById = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const p of stockedProducts) m.set(p.id, p);
    return m;
  }, [stockedProducts]);

  const usedIds = new Set(recipes.map((r) => r.ingredient_product_id));
  const available = stockedProducts.filter((p) => !usedIds.has(p.id) && p.id !== productId);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["product-recipes-for", productId] });
    await qc.invalidateQueries({ queryKey: ["product-recipes"] });
  };

  const handleAdd = async () => {
    if (!picking) return;
    const { error } = await supabase
      .from("product_recipes" as any)
      .insert({ product_id: productId, ingredient_product_id: picking });
    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
      return;
    }
    setPicking("");
    await invalidate();
  };

  const handleRemove = async (id: string) => {
    const { error } = await supabase.from("product_recipes" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    await invalidate();
  };

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="mb-2">
        <p className="text-sm font-semibold text-foreground">Ingredientes do estoque</p>
        <p className="text-[11px] text-muted-foreground">
          Quando QUALQUER ingrediente abaixo zerar no estoque, este prato fica
          marcado como ESGOTADO no PALM.
        </p>
      </div>

      {recipes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic mb-2">
          Nenhum ingrediente vinculado.
        </p>
      ) : (
        <ul className="space-y-1 mb-2">
          {recipes.map((r) => {
            const ing = ingredientsById.get(r.ingredient_product_id);
            return (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border bg-background px-2 py-1.5"
              >
                <span className="text-sm text-foreground">
                  {ing?.name ?? r.ingredient_product_id}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(r.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover ingrediente"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {available.length > 0 ? (
        <div className="flex gap-2">
          <Select value={picking} onValueChange={setPicking}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Escolher ingrediente…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="secondary" onClick={handleAdd} disabled={!picking}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground italic">
          Nenhum produto com estoque disponível para vincular.
        </p>
      )}
    </div>
  );
}
