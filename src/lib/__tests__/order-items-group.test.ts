import { describe, it, expect } from "vitest";
import {
  groupItemsByProductAndWaiter,
  summarizeItemWaiters,
  formatWaiterTag,
} from "@/lib/order-items-group";
import { OrderItem } from "@/lib/types";

const makeItem = (over: Partial<OrderItem>): OrderItem => ({
  id: Math.random().toString(),
  order_id: "o1",
  product_id: "p1",
  product_name: "Coca",
  product_price: 5,
  quantity: 1,
  note: null,
  subtotal: 5,
  waiter_name: null,
  ...over,
});

describe("groupItemsByProductAndWaiter", () => {
  it("deduplicates same product+waiter+note", () => {
    const items = [
      makeItem({ waiter_name: "Joao", quantity: 1, subtotal: 5 }),
      makeItem({ waiter_name: "Joao", quantity: 1, subtotal: 5 }),
    ];
    const out = groupItemsByProductAndWaiter(items);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(2);
    expect(out[0].subtotal).toBe(10);
  });

  it("keeps separate when waiter differs", () => {
    const items = [
      makeItem({ waiter_name: "Joao" }),
      makeItem({ waiter_name: "Maria" }),
    ];
    const out = groupItemsByProductAndWaiter(items);
    expect(out).toHaveLength(2);
  });

  it("keeps separate when note differs", () => {
    const items = [
      makeItem({ waiter_name: "Joao", note: "sem gelo" }),
      makeItem({ waiter_name: "Joao", note: "" }),
    ];
    const out = groupItemsByProductAndWaiter(items);
    expect(out).toHaveLength(2);
  });
});

describe("summarizeItemWaiters", () => {
  it("merges by product+note, lists unique waiters", () => {
    const items = [
      makeItem({ waiter_name: "Joao", quantity: 1, subtotal: 5 }),
      makeItem({ waiter_name: "Maria", quantity: 1, subtotal: 5 }),
      makeItem({ waiter_name: "Joao", quantity: 1, subtotal: 5 }),
    ];
    const out = summarizeItemWaiters(items);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(3);
    expect(out[0].subtotal).toBe(15);
    expect(out[0].waiters.sort()).toEqual(["Joao", "Maria"]);
  });

  it("splits by note", () => {
    const items = [
      makeItem({ note: "sem gelo" }),
      makeItem({ note: "" }),
    ];
    const out = summarizeItemWaiters(items);
    expect(out).toHaveLength(2);
  });
});

describe("formatWaiterTag", () => {
  it("returns null when no waiters", () => {
    expect(formatWaiterTag([])).toBeNull();
  });
  it("returns null when single waiter equals main", () => {
    expect(formatWaiterTag(["Joao"], "Joao")).toBeNull();
  });
  it("shows tag when single waiter differs from main", () => {
    expect(formatWaiterTag(["Maria"], "Joao")).toBe("por Maria");
  });
  it("shows joined list when multiple waiters", () => {
    expect(formatWaiterTag(["Joao", "Maria"], "Joao")).toBe("por Joao, Maria");
  });
  it("dedupes waiter names", () => {
    expect(formatWaiterTag(["Joao", "Joao", "Maria"], "")).toBe("por Joao, Maria");
  });
});
