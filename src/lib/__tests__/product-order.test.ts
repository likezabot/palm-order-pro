import { describe, it, expect } from "vitest";
import { sortByPersistedOrder, orderKey } from "@/lib/product-order";
import type { Product } from "@/lib/types";

const p = (id: string, name: string): Product => ({
  id,
  name,
  price: 0,
  category: "x",
  active: true,
  created_at: "",
});

describe("sortByPersistedOrder — fluxo crítico Admin (drag & drop produtos)", () => {
  it("ordena conforme IDs persistidos", () => {
    const list = [p("a", "A"), p("b", "B"), p("c", "C")];
    const sorted = sortByPersistedOrder(list, ["c", "a", "b"]);
    expect(sorted.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("itens fora da ordem persistida vão para o fim, alfabético", () => {
    const list = [p("a", "Zebra"), p("b", "Banana"), p("c", "Caju")];
    const sorted = sortByPersistedOrder(list, ["c"]);
    expect(sorted.map((x) => x.id)).toEqual(["c", "b", "a"]); // c first, then Banana, Zebra
  });

  it("fallback alfabético quando não há ordem persistida", () => {
    const list = [p("a", "Zebra"), p("b", "Abacaxi")];
    expect(sortByPersistedOrder(list, null).map((x) => x.id)).toEqual(["a", "b"]); // não toca
    expect(sortByPersistedOrder(list, []).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("orderKey gera prefixo consistente", () => {
    expect(orderKey("bebidas")).toBe("product_order_bebidas");
  });
});
