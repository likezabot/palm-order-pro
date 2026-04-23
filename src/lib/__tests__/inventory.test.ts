import { describe, it, expect } from "vitest";
import {
  slugify,
  getStockStatus,
  formatQty,
  getDisplayCategory,
  mapMenuCategoryToStock,
  criticalScore,
  sortByCriticality,
} from "@/lib/inventory";

describe("inventory.slugify", () => {
  it("removes accents and lowercases", () => {
    expect(slugify("Coração de Frango")).toBe("coracao-de-frango");
  });
  it("trims and collapses separators", () => {
    expect(slugify("  Coca   Cola 1L  ")).toBe("coca-cola-1l");
  });
  it("handles empty", () => {
    expect(slugify("")).toBe("");
  });
});

describe("inventory.getStockStatus", () => {
  it("negative when current < 0", () => {
    expect(getStockStatus({ current_stock: -1, min_stock: 5 })).toBe("negative");
  });
  it("zero when current === 0", () => {
    expect(getStockStatus({ current_stock: 0, min_stock: 5 })).toBe("zero");
  });
  it("low when current <= min", () => {
    expect(getStockStatus({ current_stock: 5, min_stock: 5 })).toBe("low");
    expect(getStockStatus({ current_stock: 3, min_stock: 5 })).toBe("low");
  });
  it("ok when above min", () => {
    expect(getStockStatus({ current_stock: 10, min_stock: 5 })).toBe("ok");
  });
});

describe("inventory.formatQty", () => {
  it("integers without decimals", () => {
    expect(formatQty(5, "un")).toBe("5 un");
  });
  it("trims trailing zeros", () => {
    expect(formatQty(2.5, "kg")).toBe("2.5 kg");
    expect(formatQty(2.0, "kg")).toBe("2 kg");
  });
});

describe("inventory.getDisplayCategory", () => {
  const map = new Map([["p1", "espetos"], ["p2", "bebidas"]]);
  it("uses linked product category", () => {
    expect(getDisplayCategory({ product_id: "p1" }, map)).toBe("espetos");
    expect(getDisplayCategory({ product_id: "p2" }, map)).toBe("bebidas");
  });
  it("falls back to insumos when unlinked", () => {
    expect(getDisplayCategory({ product_id: null }, map)).toBe("insumos");
  });
  it("falls back to insumos when product not in map", () => {
    expect(getDisplayCategory({ product_id: "missing" }, map)).toBe("insumos");
  });
});

describe("inventory.mapMenuCategoryToStock", () => {
  it("maps cerveja variants", () => {
    expect(mapMenuCategoryToStock("Cerveja")).toBe("cervejas");
  });
  it("maps refrigerante to bebidas", () => {
    expect(mapMenuCategoryToStock("Refrigerante")).toBe("bebidas");
  });
  it("defaults unknown to espetos", () => {
    expect(mapMenuCategoryToStock("xyz")).toBe("espetos");
  });
});

describe("inventory.criticalScore + sortByCriticality", () => {
  it("orders most-critical first", () => {
    const items = [
      { current_stock: 10, min_stock: 5 },
      { current_stock: -2, min_stock: 5 },
      { current_stock: 0, min_stock: 5 },
      { current_stock: 4, min_stock: 5 },
    ];
    const sorted = sortByCriticality(items);
    expect(sorted[0].current_stock).toBe(-2);
    expect(sorted[1].current_stock).toBe(0);
    expect(sorted[2].current_stock).toBe(4);
    expect(sorted[3].current_stock).toBe(10);
  });
});
