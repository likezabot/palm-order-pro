import { describe, it, expect } from "vitest";
import { calculateDelta, DeltaItem } from "@/lib/order-delta";
import { CartItem, Product } from "@/lib/types";

const UUID_A = "11111111-1111-1111-1111-111111111111"; // 36 chars
const UUID_B = "22222222-2222-2222-2222-222222222222";

const product = (id: string, name: string, price = 10): Product => ({
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
 * `delta_items` é gravado no banco em `orders.delta_items` (jsonb) e
 * usado para imprimir o "ACRÉSCIMO" sem reimprimir o pedido inteiro.
 * Estes testes garantem o formato esperado pelo backend / impressora.
 */
describe("parsing de delta_items", () => {
  it("preserva product_id apenas quando é UUID válido (36 chars)", () => {
    const old: CartItem[] = [];
    const next = [item(product(UUID_A, "Picanha"), 1), item(product("ad-hoc-name", "Pão", 2), 1)];
    const delta = calculateDelta(old, next);
    const picanha = delta.find((d) => d.product_name === "Picanha")!;
    const pao = delta.find((d) => d.product_name === "Pão")!;
    expect(picanha.product_id).toBe(UUID_A);
    expect(pao.product_id).toBeNull();
  });

  it("note vazia é serializada como null (não string)", () => {
    const delta = calculateDelta([], [item(product(UUID_A, "Frango"), 1, "")]);
    expect(delta[0].note).toBeNull();
  });

  it("note preenchida é preservada", () => {
    const delta = calculateDelta([], [item(product(UUID_A, "Frango"), 1, "bem passado")]);
    expect(delta[0].note).toBe("bem passado");
  });

  it("subtotal = quantidade ADICIONADA × preço (não quantidade total)", () => {
    const old = [item(product(UUID_A, "Coxinha", 8), 2)];
    const next = [item(product(UUID_A, "Coxinha", 8), 5)];
    const delta = calculateDelta(old, next);
    expect(delta[0].quantity).toBe(3); // 5 - 2
    expect(delta[0].subtotal).toBe(24); // 3 × 8
  });

  it("delta vazio (nenhum acréscimo) é serializável como []", () => {
    const old = [item(product(UUID_A, "X"), 2)];
    const next = [item(product(UUID_A, "X"), 1)]; // diminuiu
    const delta = calculateDelta(old, next);
    expect(delta).toEqual([]);
    expect(JSON.stringify(delta)).toBe("[]");
  });

  it("round-trip JSON preserva todos os campos", () => {
    const delta = calculateDelta(
      [],
      [
        item(product(UUID_A, "Cerveja", 12.5), 2, "gelada"),
        item(product(UUID_B, "X-Tudo", 25), 1),
      ],
    );
    const parsed: DeltaItem[] = JSON.parse(JSON.stringify(delta));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      product_id: UUID_A,
      product_name: "Cerveja",
      quantity: 2,
      product_price: 12.5,
      note: "gelada",
      subtotal: 25,
    });
    expect(parsed[1].note).toBeNull();
  });
});
