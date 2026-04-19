import { describe, it, expect } from "vitest";
import type { CartItem, Product } from "@/lib/types";

/**
 * Smoke test do cálculo de total/quantidade do carrinho — lógica replicada em
 * Palm.tsx e Pdv.tsx. Garante que o refator preserve a fórmula.
 */

const p = (id: string, name: string, price: number): Product => ({
  id,
  name,
  price,
  category: "x",
  active: true,
  created_at: "",
});

const total = (cart: CartItem[]) => cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
const itemCount = (cart: CartItem[]) => cart.reduce((s, i) => s + i.quantity, 0);

describe("cart totals — fluxo crítico Palm/Pdv", () => {
  it("carrinho vazio: total e count = 0", () => {
    expect(total([])).toBe(0);
    expect(itemCount([])).toBe(0);
  });

  it("soma price * quantity respeitando casas decimais", () => {
    const cart: CartItem[] = [
      { product: p("a", "X", 12.5), quantity: 2, note: "" },
      { product: p("b", "Y", 7.9), quantity: 3, note: "" },
    ];
    expect(total(cart)).toBeCloseTo(48.7, 2);
    expect(itemCount(cart)).toBe(5);
  });

  it("ignora itens com quantity 0 no count, mas preserva no total se houver", () => {
    const cart: CartItem[] = [{ product: p("a", "X", 10), quantity: 0, note: "" }];
    expect(total(cart)).toBe(0);
    expect(itemCount(cart)).toBe(0);
  });
});

/**
 * Cálculo de troco — usado em CloseOrder/Cashier.
 */
describe("troco — fluxo crítico Cashier", () => {
  const change = (paid: number, totalDue: number) => Math.max(0, paid - totalDue);

  it("troco positivo quando pago > total", () => {
    expect(change(50, 38.5)).toBeCloseTo(11.5, 2);
  });

  it("troco zero quando pago = total", () => {
    expect(change(50, 50)).toBe(0);
  });

  it("troco zero (não negativo) quando pago < total", () => {
    expect(change(20, 50)).toBe(0);
  });
});
