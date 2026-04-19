/**
 * Detecta grupos de pedidos duplicados na mesma mesa física.
 * BALCÃO é ignorado (permite múltiplos pedidos simultâneos por senha).
 *
 * A mesa física é definida por `original_table_name` (ou `table_name` como fallback).
 */

export interface OrderForDuplicateCheck {
  id: string;
  table_name: string;
  original_table_name: string | null;
  created_at: string;
}

export interface DuplicateGroup<T extends OrderForDuplicateCheck = OrderForDuplicateCheck> {
  physicalTable: string;
  orders: T[];
}

export function findDuplicateGroups<T extends OrderForDuplicateCheck>(
  orders: T[],
): DuplicateGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const o of orders) {
    const key = (o.original_table_name ?? o.table_name) || "";
    if (!key || key === "BALCÃO") continue;
    const arr = map.get(key) ?? [];
    arr.push(o);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .filter(([, list]) => list.length > 1)
    .map(([physicalTable, list]) => ({ physicalTable, orders: list }))
    .sort((a, b) =>
      a.physicalTable.localeCompare(b.physicalTable, "pt-BR", { numeric: true }),
    );
}
