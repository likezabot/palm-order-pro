import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { arrayMove } from "@dnd-kit/sortable";
import { DragEndEvent } from "@dnd-kit/core";
import { CATEGORIES, CATEGORY_LABELS, Product } from "@/lib/types";
import {
  fetchAllOrders,
  saveOrder,
  sortByPersistedOrder,
  resetOrder,
} from "@/lib/product-order";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";

export const useProductOrder = (products: Product[]) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playFeedback } = useFeedback();

  const { data: orderMap = {} } = useQuery({
    queryKey: ["product-order"],
    queryFn: () => fetchAllOrders([...CATEGORIES]),
  });

  const productsByCategory = useMemo(() => {
    const map: Record<string, Product[]> = {};
    CATEGORIES.forEach((cat) => {
      const items = products.filter((p) => p.category === cat);
      map[cat] = sortByPersistedOrder(items, orderMap[cat] ?? null);
    });
    return map;
  }, [products, orderMap]);

  const handleDragEnd = async (cat: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = productsByCategory[cat];
    const oldIndex = current.findIndex((p) => p.id === active.id);
    const newIndex = current.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(current, oldIndex, newIndex);
    const ids = reordered.map((p) => p.id);
    queryClient.setQueryData(["product-order"], { ...orderMap, [cat]: ids });
    try {
      await saveOrder(cat, ids);
      playFeedback("success");
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar ordem" });
      queryClient.invalidateQueries({ queryKey: ["product-order"] });
    }
  };

  const handleResetOrder = async (cat: string) => {
    if (!confirm(`Restaurar ordem alfabética em ${CATEGORY_LABELS[cat]}?`)) return;
    playFeedback("click");
    queryClient.setQueryData(["product-order"], { ...orderMap, [cat]: [] });
    try {
      await resetOrder(cat);
      playFeedback("success");
      toast({ title: `Ordem alfabética restaurada em ${CATEGORY_LABELS[cat]}` });
    } catch {
      toast({ variant: "destructive", title: "Erro ao restaurar ordem" });
      queryClient.invalidateQueries({ queryKey: ["product-order"] });
    }
  };

  return { orderMap, productsByCategory, handleDragEnd, handleResetOrder };
};
