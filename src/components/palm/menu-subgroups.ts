import type { Product } from "@/lib/types";

/**
 * Subgrupos por categoria, mapeados por nome do produto.
 * Match é por substring case-insensitive — robusto a pequenas variações.
 */
export type Subgroup = { label: string; matchers: string[] };

export const SUBGROUPS: Record<string, Subgroup[]> = {
  bebidas: [
    { label: "KS 290ml", matchers: ["ks coca-cola zero", "ks coca-cola normal"] },
    {
      label: "Mini 220ml",
      matchers: [
        "coca-cola 220ml",
        "coca-cola zero 220ml",
        "fanta-uva 220ml",
        "guaraná 220ml",
        "fanta-laranja 220ml",
        "sprite 220ml",
      ],
    },
    { label: "Refri 350ml", matchers: ["coca-cola 350ml", "coca-cola zero 350ml"] },
    {
      label: "Refri 600ml",
      matchers: ["coca-cola 600ml", "coca-cola zero 600ml", "tubaina 600ml"],
    },
    { label: "Refri 1L", matchers: ["coca-cola 1l", "guaraná 1l"] },
    { label: "Refri 2L", matchers: ["coca-cola 2l", "coca-cola zero 2l"] },
    { label: "Água", matchers: ["água com gás", "água sem gás"] },
    {
      label: "Sucos Del Valle 290ml",
      matchers: [
        "suco del valle maracujá",
        "suco del valle pêssego",
        "suco del valle uva",
      ],
    },
  ],
  // Cervejas: removido subgrupo — agora cards diretos como qualquer outra categoria.
};

/** Variantes do produto base "Porco" — apresentadas em popup ao tocar no card. */
export const PORCO_VARIANTS = ["Porco", "Panceta suína", "Costela suína"] as const;

/** Nomes que devem ser ocultados da grade de Espetos (apresentados via popup do Porco). */
export const HIDDEN_ESPETO_NAMES = ["panceta suína", "costela suína"];

export const matchesSubgroup = (product: Product, sub: Subgroup) => {
  const n = product.name.toLowerCase();
  return sub.matchers.some((m) => n.includes(m));
};
