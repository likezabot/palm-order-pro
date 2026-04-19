import { describe, it, expect } from "vitest";
import { CartItem, Product } from "@/lib/types";

const product = (id: string, name: string, price: number): Product => ({
  id,
  name,
  price,
  category: "espetos",
  active: true,
  created_at: "",
});

const item = (p: Product, quantity: number, note = ""): CartItem => ({
  product: p,
  quantity,
  note,
});

/**
 * Replica a lógica usada no Palm/PDV:
 * subtotal = product.price * quantity (a observação não afeta valor).
 */
const subtotal = (i: CartItem) => i.product.price * i.quantity;

describe("cálculo de subtotal com observação", () => {
  it("a observação não altera o subtotal", () => {
    const p = product("1", "Picanha", 25);
    const semNota = item(p, 2, "");
    const comNota = item(p, 2, "sem cebola, ao ponto");
    expect(subtotal(semNota)).toBe(50);
    expect(subtotal(comNota)).toBe(50);
    expect(subtotal(semNota)).toBe(subtotal(comNota));
  });

  it("preserva nota ao construir item de carrinho", () => {
    const p = product("1", "Frango", 20);
    const i = item(p, 3, "bem passado");
    expect(i.note).toBe("bem passado");
    expect(subtotal(i)).toBe(60);
  });

  it("trata observação undefined/vazia consistentemente", () => {
    const p = product("1", "Coxinha", 8);
    expect(subtotal(item(p, 4, ""))).toBe(32);
    expect(subtotal(item(p, 4))).toBe(32);
  });

  it("preço fracionado mantém precisão decimal", () => {
    const p = product("1", "Cerveja 600ml", 12.5);
    const i = item(p, 3, "gelada");
    expect(subtotal(i)).toBe(37.5);
  });
});
