import { describe, it, expect } from "vitest";
import { calculateDelta } from "@/lib/order-delta";
import type { CartItem, Product } from "@/lib/types";

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const prod = (id: string, name: string, price: number): Product => ({
  id,
  name,
  price,
  category: "x",
  active: true,
  created_at: "",
});
const item = (p: Product, qty: number, note = ""): CartItem => ({ product: p, quantity: qty, note });

describe("calculateDelta — fluxo crítico Palm (acréscimo a pedido existente)", () => {
  it("retorna vazio quando carrinhos são iguais", () => {
    const p = prod(uuid(1), "X-Bacon", 25);
    expect(calculateDelta([item(p, 2)], [item(p, 2)])).toEqual([]);
  });

  it("detecta item totalmente novo", () => {
    const a = prod(uuid(1), "Espeto", 10);
    const b = prod(uuid(2), "Refri", 6);
    const delta = calculateDelta([item(a, 1)], [item(a, 1), item(b, 2)]);
    expect(delta).toHaveLength(1);
    expect(delta[0]).toMatchObject({ product_name: "Refri", quantity: 2, subtotal: 12 });
  });

  it("detecta apenas o aumento de quantidade, não o total", () => {
    const a = prod(uuid(1), "Cerveja", 8);
    const delta = calculateDelta([item(a, 1)], [item(a, 4)]);
    expect(delta).toHaveLength(1);
    expect(delta[0].quantity).toBe(3); // 4 - 1
    expect(delta[0].subtotal).toBe(24); // 3 * 8
  });

  it("ignora remoções e diminuições (delta é só acréscimo)", () => {
    const a = prod(uuid(1), "X", 10);
    const b = prod(uuid(2), "Y", 5);
    expect(calculateDelta([item(a, 3), item(b, 2)], [item(a, 1)])).toEqual([]);
  });

  it("usa null em product_id quando id não é UUID (item legado)", () => {
    const legacy = prod("legacy-name-key", "Legado", 5);
    const delta = calculateDelta([], [item(legacy, 1)]);
    expect(delta[0].product_id).toBeNull();
  });
});
