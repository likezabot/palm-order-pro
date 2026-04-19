/**
 * Formatação de senha do BALCÃO.
 * A senha é o índice (1-based) do pedido entre todos os pedidos
 * BALCÃO criados HOJE, formatado como #001, #002, etc.
 */

export interface BalcaoOrderForSenha {
  id: string;
  table_name: string;
  created_at: string;
}

/** Filtra pedidos BALCÃO criados a partir do início do dia de `now`. */
export function filterTodayBalcao<T extends BalcaoOrderForSenha>(
  orders: T[],
  now: Date = new Date(),
): T[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return orders
    .filter(
      (o) => o.table_name === "BALCÃO" && new Date(o.created_at).getTime() >= today.getTime(),
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/**
 * Calcula a senha de um pedido BALCÃO (formato #001).
 * Retorna `#000` se o pedido não estiver na lista.
 */
export function getSenha(
  orderId: string,
  allOrders: BalcaoOrderForSenha[],
  now: Date = new Date(),
): string {
  const today = filterTodayBalcao(allOrders, now);
  const idx = today.findIndex((o) => o.id === orderId);
  const num = idx >= 0 ? idx + 1 : 0;
  return `#${num.toString().padStart(3, "0")}`;
}
