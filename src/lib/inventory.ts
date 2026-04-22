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

export const STOCK_CATEGORIES = [
  "bebidas",
  "carnes",
  "descartáveis",
  "gás/carvão",
  "limpeza",
  "outros",
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

export type StockStatus = "zero" | "low" | "ok";

export function getStockStatus(item: Pick<InventoryItem, "current_stock" | "min_stock">): StockStatus {
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
