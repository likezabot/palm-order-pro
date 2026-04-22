export type InventoryItem = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  category: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  is_active: boolean;
  product_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryMovement = {
  id: string;
  item_id: string;
  movement_type: "in" | "out" | "adjustment";
  quantity: number;
  note: string | null;
  source: "manual" | "telegram" | "pdv" | "system";
  created_at: string;
};

// Categorias do cardápio (alinhadas com src/lib/types.ts CATEGORIES).
export const STOCK_CATEGORIES = [
  "refeicoes",
  "espetos",
  "bebidas",
  "cervejas",
] as const;

export const STOCK_UNITS = [
  "unidade",
  "kg",
  "g",
  "l",
  "ml",
  "caixa",
  "pacote",
] as const;

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type StockStatus = "negative" | "zero" | "low" | "ok";

export function getStockStatus(item: Pick<InventoryItem, "current_stock" | "min_stock">): StockStatus {
  if (item.current_stock < 0) return "negative";
  if (item.current_stock <= 0) return "zero";
  if (item.current_stock <= item.min_stock) return "low";
  return "ok";
}

export function formatQty(n: number, unit: string): string {
  const v = Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, "");
  return `${v} ${unit}`;
}

export const SOURCE_LABEL: Record<InventoryMovement["source"], string> = {
  manual: "Manual",
  telegram: "Telegram",
  pdv: "PDV",
  system: "Sistema",
};

export const TYPE_LABEL: Record<InventoryMovement["movement_type"], string> = {
  in: "Entrada",
  out: "Saída",
  adjustment: "Ajuste",
};

// Display categories used in the Stock screen — mirror the PALM menu tabs
// (refeicoes/espetos/bebidas/cervejas) plus "insumos" for unlinked supplies.
export const DISPLAY_CATEGORIES = [
  "refeicoes",
  "espetos",
  "bebidas",
  "cervejas",
  "insumos",
] as const;
export type DisplayCategory = (typeof DISPLAY_CATEGORIES)[number];

export const DISPLAY_CATEGORY_LABELS: Record<string, string> = {
  refeicoes: "Refeições",
  espetos: "Espetos",
  bebidas: "Bebidas",
  cervejas: "Cervejas",
  insumos: "Insumos",
};

/**
 * Resolve the display category for a stock item:
 * - linked items use their menu product's category (refeicoes/espetos/bebidas/cervejas)
 * - unlinked items fall back to "insumos"
 */
export function getDisplayCategory(
  item: Pick<InventoryItem, "product_id">,
  productCategoryById: Map<string, string>,
): DisplayCategory {
  if (item.product_id) {
    const cat = productCategoryById.get(item.product_id);
    if (cat === "refeicoes" || cat === "espetos" || cat === "bebidas" || cat === "cervejas") {
      return cat;
    }
  }
  return "insumos";
}

// Maps a menu category (products.category) to a stock category.
// Stock categories são alinhadas ao cardápio (refeicoes/espetos/bebidas/cervejas).
export function mapMenuCategoryToStock(menuCategory: string): string {
  const c = (menuCategory || "").toLowerCase().trim();
  if (!c) return "espetos";
  if (c.includes("cerve")) return "cervejas";
  if (c.includes("beb") || c.includes("refri")) return "bebidas";
  if (c.includes("refeic") || c.includes("refeição")) return "refeicoes";
  if (c.includes("espeto") || c.includes("carne")) return "espetos";
  // fallback: usa a string original se já for um slug canônico, senão "espetos"
  if (["refeicoes", "espetos", "bebidas", "cervejas"].includes(c)) return c;
  return "espetos";
}

// Critical margin: how close item is to running out (lower = worse).
// Negative items first; then zero; then by gap = current - min.
export function criticalScore(item: Pick<InventoryItem, "current_stock" | "min_stock">): number {
  return item.current_stock - item.min_stock;
}

export function sortByCriticality<T extends Pick<InventoryItem, "current_stock" | "min_stock">>(items: T[]): T[] {
  return [...items].sort((a, b) => criticalScore(a) - criticalScore(b));
}
