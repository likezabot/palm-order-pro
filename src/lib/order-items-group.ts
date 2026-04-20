import { OrderItem } from "@/lib/types";

/**
 * Item normalizado para uso interno dos helpers.
 */
export interface NormalizedOrderItem {
  product_id: string | null;
  product_name: string;
  product_price: number;
  quantity: number;
  subtotal: number;
  note: string;
  waiter_name: string;
}

function normalize(item: OrderItem, fallbackWaiter = ""): NormalizedOrderItem {
  return {
    product_id: item.product_id ?? null,
    product_name: item.product_name,
    product_price: item.product_price,
    quantity: item.quantity,
    subtotal: item.subtotal,
    note: item.note || "",
    waiter_name: item.waiter_name || fallbackWaiter || "",
  };
}

/**
 * Agrupa itens por (product_id|product_name, note, waiter) somando quantity e subtotal.
 * Útil para deduplicar linhas que vieram cruas do banco quando o mesmo garçom anotou
 * o mesmo produto várias vezes.
 */
export function groupItemsByProductAndWaiter(
  items: OrderItem[],
  fallbackWaiter = "",
): NormalizedOrderItem[] {
  const map = new Map<string, NormalizedOrderItem>();
  for (const raw of items) {
    const it = normalize(raw, fallbackWaiter);
    const key = `${it.product_id || it.product_name}|${it.note}|${it.waiter_name}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += it.quantity;
      existing.subtotal += it.subtotal;
    } else {
      map.set(key, { ...it });
    }
  }
  return Array.from(map.values());
}

export interface SummarizedItem {
  product_id: string | null;
  product_name: string;
  product_price: number;
  quantity: number;
  subtotal: number;
  note: string;
  waiters: string[];
}

/**
 * Agrupa itens por (product_id|product_name, note) — ignorando garçom — e devolve
 * a lista única de garçons (sem duplicatas) que anotaram o item.
 * Usado para mostrar UMA linha por produto com tag "por João, Maria".
 */
export function summarizeItemWaiters(
  items: OrderItem[],
  fallbackWaiter = "",
): SummarizedItem[] {
  const map = new Map<string, SummarizedItem & { _waiterSet: Set<string> }>();
  for (const raw of items) {
    const it = normalize(raw, fallbackWaiter);
    const key = `${it.product_id || it.product_name}|${it.note}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += it.quantity;
      existing.subtotal += it.subtotal;
      if (it.waiter_name) existing._waiterSet.add(it.waiter_name);
    } else {
      const set = new Set<string>();
      if (it.waiter_name) set.add(it.waiter_name);
      map.set(key, {
        product_id: it.product_id,
        product_name: it.product_name,
        product_price: it.product_price,
        quantity: it.quantity,
        subtotal: it.subtotal,
        note: it.note,
        waiters: [],
        _waiterSet: set,
      });
    }
  }
  return Array.from(map.values()).map(({ _waiterSet, ...rest }) => ({
    ...rest,
    waiters: Array.from(_waiterSet),
  }));
}

/**
 * Decide se a tag "por X" deve ser exibida e devolve o texto formatado.
 * Regra: mostrar se houver >1 garçom OU se o único garçom for diferente do principal.
 */
export function formatWaiterTag(
  waiters: string[],
  orderMainWaiter?: string | null,
): string | null {
  const unique = Array.from(new Set(waiters.filter(Boolean)));
  if (unique.length === 0) return null;
  if (unique.length === 1 && unique[0] === (orderMainWaiter || "")) return null;
  return `por ${unique.join(", ")}`;
}
