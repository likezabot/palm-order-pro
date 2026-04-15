/**
 * Cálculo de delta (acréscimo) entre carrinho antigo e novo.
 * Usado pelo Palm ao atualizar um pedido existente.
 */

import { CartItem } from "@/lib/types";

export interface DeltaItem {
  product_id: string | null;
  product_name: string;
  quantity: number; // quantidade ADICIONADA (não total)
  product_price: number;
  note: string | null;
  subtotal: number;
}

/**
 * Compara o carrinho original com o novo e retorna apenas os acréscimos:
 * - Itens totalmente novos
 * - Aumento de quantidade em itens existentes
 * 
 * Não retorna: remoções, diminuições de quantidade
 */
export function calculateDelta(oldCart: CartItem[], newCart: CartItem[]): DeltaItem[] {
  const delta: DeltaItem[] = [];

  for (const newItem of newCart) {
    const oldItem = oldCart.find((o) => o.product.id === newItem.product.id);

    if (!oldItem) {
      // Item totalmente novo
      delta.push({
        product_id: newItem.product.id.length === 36 ? newItem.product.id : null,
        product_name: newItem.product.name,
        quantity: newItem.quantity,
        product_price: newItem.product.price,
        note: newItem.note || null,
        subtotal: newItem.product.price * newItem.quantity,
      });
    } else if (newItem.quantity > oldItem.quantity) {
      // Quantidade aumentou
      const addedQty = newItem.quantity - oldItem.quantity;
      delta.push({
        product_id: newItem.product.id.length === 36 ? newItem.product.id : null,
        product_name: newItem.product.name,
        quantity: addedQty,
        product_price: newItem.product.price,
        note: newItem.note || null,
        subtotal: newItem.product.price * addedQty,
      });
    }
    // Se qty diminuiu ou igual → ignorar (não é acréscimo)
  }

  return delta;
}
