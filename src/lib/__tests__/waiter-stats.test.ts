import { describe, expect, it } from "vitest";

interface Item { product_name: string; quantity: number; subtotal: number; waiter_name: string | null }
interface Order { waiter_name: string | null; order_items: Item[] }

// Mesma lógica usada em StatsPanel.byWaiter
function aggregateByWaiter(orders: Order[]) {
  const agg: Record<string, { revenue: number; items: number }> = {};
  orders.forEach((o) => {
    o.order_items.forEach((i) => {
      const name = (i.waiter_name || o.waiter_name || "Sem garçom").trim() || "Sem garçom";
      if (!agg[name]) agg[name] = { revenue: 0, items: 0 };
      agg[name].revenue += i.subtotal;
      agg[name].items += i.quantity;
    });
  });
  return Object.entries(agg)
    .map(([name, v]) => ({ name, revenue: v.revenue, items: v.items }))
    .sort((a, b) => b.revenue - a.revenue);
}

describe("aggregateByWaiter", () => {
  it("credita cada item ao garçom que adicionou (multi-garçom na mesma mesa)", () => {
    const orders: Order[] = [
      {
        waiter_name: "Ana",
        order_items: [
          { product_name: "X", quantity: 1, subtotal: 10, waiter_name: "Ana" },
          { product_name: "Y", quantity: 2, subtotal: 30, waiter_name: "Bruno" },
        ],
      },
    ];
    const r = aggregateByWaiter(orders);
    expect(r).toEqual([
      { name: "Bruno", revenue: 30, items: 2 },
      { name: "Ana", revenue: 10, items: 1 },
    ]);
  });

  it("usa fallback para waiter_name do pedido em itens antigos sem waiter no item", () => {
    const orders: Order[] = [
      {
        waiter_name: "Carla",
        order_items: [
          { product_name: "Z", quantity: 3, subtotal: 45, waiter_name: null },
        ],
      },
    ];
    const r = aggregateByWaiter(orders);
    expect(r).toEqual([{ name: "Carla", revenue: 45, items: 3 }]);
  });

  it("agrega 'Sem garçom' quando não há nenhum nome", () => {
    const orders: Order[] = [
      { waiter_name: null, order_items: [{ product_name: "W", quantity: 1, subtotal: 5, waiter_name: null }] },
    ];
    expect(aggregateByWaiter(orders)).toEqual([{ name: "Sem garçom", revenue: 5, items: 1 }]);
  });
});
