/**
 * Helper de grupos para o CARDÁPIO PÚBLICO.
 * Reusa exatamente os mesmos `product_groups` cadastrados em `settings`
 * (mesma chave usada pelo Palm), porém:
 *  - Resolve membros contra `PublicProduct[]` (somente itens visíveis online).
 *  - Esconde os membros do feed principal (exceto o trigger), igual ao Palm.
 *  - Expõe um "card de grupo" com preço "a partir de R$ X,XX".
 *
 * Não duplica a query do Palm: usa a mesma `queryKey` ["settings", "product_groups"],
 * portanto compartilha cache do react-query (zero requisição extra quando ambos abrem).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_GROUPS_KEY, norm, type ProductGroup } from "@/lib/product-groups";
import type { PublicProduct } from "@/lib/public-menu";

async function fetchGroupsPublic(): Promise<ProductGroup[]> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", PRODUCT_GROUPS_KEY)
    .maybeSingle();
  if (error || !data?.value) return [];
  try {
    const parsed = JSON.parse(data.value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (g): g is ProductGroup =>
          g &&
          typeof g.id === "string" &&
          typeof g.name === "string" &&
          typeof g.category === "string" &&
          Array.isArray(g.member_names),
      )
      .map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon || "📦",
        category: g.category,
        trigger_product_name: g.trigger_product_name || g.name,
        member_names: g.member_names.filter((n: unknown) => typeof n === "string"),
      }));
  } catch {
    return [];
  }
}

export function usePublicProductGroups() {
  return useQuery({
    queryKey: ["settings", PRODUCT_GROUPS_KEY],
    staleTime: 60_000,
    queryFn: fetchGroupsPublic,
  });
}

export type CategoryEntry =
  | { kind: "product"; product: PublicProduct }
  | {
      kind: "group";
      group: ProductGroup;
      trigger: PublicProduct;
      variants: PublicProduct[];
      minPrice: number;
      allSoldOut: boolean;
    };

/**
 * Constrói as entradas a serem renderizadas em uma categoria.
 * - Produtos sem grupo viram entradas `kind: "product"` (renderização atual).
 * - Trigger de grupo vira entrada `kind: "group"` com variantes resolvidas.
 * - Demais membros do grupo são escondidos do feed (aparecem só no sheet).
 * - Se o grupo não tem trigger disponível online, ele NÃO aparece no público
 *   (fallback gracioso — não inventa cards).
 */
export function buildCategoryEntries(
  products: PublicProduct[],
  groups: ProductGroup[],
  categorySlug: string,
): CategoryEntry[] {
  const inCategory = products.filter((p) => p.category === categorySlug);
  const groupsHere = groups.filter((g) => g.category === categorySlug);

  // Nomes (normalizados) de membros que devem sumir do feed (qualquer um != trigger).
  const hiddenNames = new Set<string>();
  // Mapa: nome do trigger normalizado -> grupo
  const triggerByName = new Map<string, ProductGroup>();

  for (const g of groupsHere) {
    const triggerNorm = norm(g.trigger_product_name);
    triggerByName.set(triggerNorm, g);
    for (const m of g.member_names) {
      const mn = norm(m);
      if (mn !== triggerNorm) hiddenNames.add(mn);
    }
  }

  // Indexa por nome para resolver membros rápido.
  const byName = new Map<string, PublicProduct>();
  for (const p of inCategory) byName.set(norm(p.name), p);

  const result: CategoryEntry[] = [];
  const consumedTriggerIds = new Set<string>();

  for (const p of inCategory) {
    const nm = norm(p.name);
    if (hiddenNames.has(nm)) continue; // membro escondido (vai dentro do popup)

    const group = triggerByName.get(nm);
    if (group) {
      if (consumedTriggerIds.has(p.id)) continue;
      consumedTriggerIds.add(p.id);

      const variants: PublicProduct[] = [];
      for (const memberName of group.member_names) {
        const variant = byName.get(norm(memberName));
        if (variant) variants.push(variant);
      }

      // Fallback: se por algum motivo não houver nenhuma variante visível
      // (todas ocultas/inativas), renderiza o trigger como produto normal.
      if (variants.length === 0) {
        result.push({ kind: "product", product: p });
        continue;
      }

      const minPrice = Math.min(...variants.map((v) => v.price));
      const allSoldOut = variants.every((v) => v.is_sold_out);

      result.push({
        kind: "group",
        group,
        trigger: p,
        variants,
        minPrice,
        allSoldOut,
      });
    } else {
      result.push({ kind: "product", product: p });
    }
  }

  return result;
}
