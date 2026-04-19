import { describe, it, expect } from "vitest";
import { findDuplicateGroups } from "@/lib/duplicates";

const order = (
  id: string,
  table: string,
  original: string | null = null,
  created = "2026-04-19T10:00:00Z",
) => ({ id, table_name: table, original_table_name: original, created_at: created });

describe("agrupamento de duplicatas", () => {
  it("retorna vazio quando não há duplicatas", () => {
    const orders = [order("a", "1"), order("b", "2"), order("c", "3")];
    expect(findDuplicateGroups(orders)).toEqual([]);
  });

  it("agrupa 2+ pedidos na mesma mesa física", () => {
    const orders = [
      order("a", "5"),
      order("b", "5"),
      order("c", "Mesa 5 reservada", "5"), // renomeada mas físicamente é a 5
    ];
    const groups = findDuplicateGroups(orders);
    expect(groups).toHaveLength(1);
    expect(groups[0].physicalTable).toBe("5");
    expect(groups[0].orders).toHaveLength(3);
  });

  it("usa original_table_name quando presente, senão table_name", () => {
    const orders = [
      order("a", "Aniversário Maria", "8"),
      order("b", "8"),
    ];
    const groups = findDuplicateGroups(orders);
    expect(groups[0].physicalTable).toBe("8");
  });

  it("ignora BALCÃO (permite múltiplos pedidos)", () => {
    const orders = [
      order("a", "BALCÃO"),
      order("b", "BALCÃO"),
      order("c", "BALCÃO"),
    ];
    expect(findDuplicateGroups(orders)).toEqual([]);
  });

  it("ordena grupos numericamente em pt-BR", () => {
    const orders = [
      order("a", "10"),
      order("b", "10"),
      order("c", "2"),
      order("d", "2"),
      order("e", "1"),
      order("f", "1"),
    ];
    const groups = findDuplicateGroups(orders);
    expect(groups.map((g) => g.physicalTable)).toEqual(["1", "2", "10"]);
  });
});
