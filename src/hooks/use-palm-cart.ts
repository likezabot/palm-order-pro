import { useCallback, useState } from "react";
import { CartItem } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { useFeedback } from "@/hooks/use-feedback";

export interface CartItemMeta {
  /** Quantidade já enviada/persistida no banco (não pode ser removida). */
  originalQty: number;
  /** Garçom da última linha inserida para esse produto. */
  lastWaiter?: string;
  /** Timestamp ISO da última inserção. */
  lastAddedAt?: string;
}

/** Chave estável p/ casar item do carrinho com meta (produto + garçom). */
export const cartMetaKey = (productId: string, waiterName?: string) =>
  `${productId}|${(waiterName || "").trim().toUpperCase()}`;

/**
 * Hook que gerencia o carrinho do garçom (Palm) — adicionar/remover/atualizar itens,
 * carregar um pedido existente do banco, e calcular totais.
 */
export const usePalmCart = () => {
  const { playFeedback } = useFeedback();
  const [tableName, setTableName] = useState("");
  const [originalTableName, setOriginalTableName] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [originalCart, setOriginalCart] = useState<CartItem[]>([]);
  const [itemsMeta, setItemsMeta] = useState<Map<string, CartItemMeta>>(new Map());
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [orderVersion, setOrderVersion] = useState<number | null>(null);
  const [senha, setSenha] = useState("");

  const loadOrder = useCallback(async (name: string, orderId?: string) => {
    setTableName(name);
    setOriginalTableName(name);
    setSenha("");
    setCart([]);
    setOriginalCart([]);
    setItemsMeta(new Map());
    setExistingOrderId(orderId ?? null);
    setOrderVersion(null);

    if (!orderId) return;

    const { data: orderData } = await supabase
      .from("orders")
      .select("version, table_name, original_table_name")
      .eq("id", orderId)
      .single();
    if (orderData) {
      setOrderVersion(orderData.version);
      if (orderData.original_table_name) {
        setOriginalTableName(orderData.original_table_name);
      }
      if (orderData.table_name && orderData.table_name !== name) {
        setTableName(orderData.table_name);
      }
    }

    // Buscamos também id e created_at p/ identificar a "última inserção" por produto.
    const { data: items } = await supabase
      .from("order_items")
      .select("id, product_id, product_name, product_price, quantity, note, waiter_name")
      .eq("order_id", orderId);

    // Buscamos timestamps separadamente do orders.created_at como aproximação
    // (order_items não tem created_at direto, então usamos id como ordem cronológica:
    // UUIDs gen_random_uuid não são ordenáveis, então usamos a ordem de retorno + orders.created_at).
    // Mais simples: pegar created_at do pedido pai como fallback e a ordem do array como cronologia.
    const { data: orderTs } = await supabase
      .from("orders")
      .select("created_at, updated_at")
      .eq("id", orderId)
      .single();

    if (items && items.length > 0) {
      const dedupeMap = new Map<string, CartItem>();
      const metaMap = new Map<string, CartItemMeta>();
      const lastTs = orderTs?.updated_at || orderTs?.created_at || new Date().toISOString();

      for (const item of items) {
        const rawWaiter = (item as any).waiter_name;
        const waiter = rawWaiter ? String(rawWaiter).trim() : undefined;
        const waiterKey = (waiter || "").toUpperCase();
        const note = item.note || "";
        const productId = item.product_id || item.product_name;
        const key = `${productId}|${note}|${waiterKey}`;
        const existing = dedupeMap.get(key);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          dedupeMap.set(key, {
            product: {
              id: productId,
              name: item.product_name,
              price: item.product_price,
              category: "",
              active: true,
              created_at: "",
            },
            quantity: item.quantity,
            note,
            waiter_name: waiter,
          });
        }

        // Meta agregada por (productId + waiter) — pega o último garçom visto.
        const mKey = cartMetaKey(productId, waiter);
        const prevMeta = metaMap.get(mKey);
        metaMap.set(mKey, {
          originalQty: (prevMeta?.originalQty || 0) + item.quantity,
          lastWaiter: waiter || prevMeta?.lastWaiter,
          lastAddedAt: lastTs,
        });
      }
      const loadedCart: CartItem[] = Array.from(dedupeMap.values());
      setCart(loadedCart);
      setOriginalCart(loadedCart.map((i) => ({ ...i, product: { ...i.product } })));
      setItemsMeta(metaMap);
      setExistingOrderId(orderId);
    }
  }, []);

  const addToCart = (product: CartItem["product"], waiterName?: string) => {
    playFeedback("click");
    setCart((prev) => {
      // Agrupa apenas se MESMO produto E MESMO garçom — assim a venda fica creditada corretamente.
      const existing = prev.find(
        (i) => i.product.id === product.id && (i.waiter_name || "") === (waiterName || ""),
      );
      if (existing) {
        return prev.map((i) =>
          i === existing ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { product, quantity: 1, note: "", waiter_name: waiterName }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    playFeedback("click");
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i,
        )
        .filter((i) => i.quantity > 0),
    );
  };

  const updateNote = (productId: string, note: string) => {
    setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, note } : i)));
  };

  const removeItem = (productId: string) => {
    playFeedback("heavy");
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const reset = () => {
    playFeedback("notification");
    setCart([]);
    setOriginalCart([]);
    setTableName("");
    setOriginalTableName("");
    setExistingOrderId(null);
    setOrderVersion(null);
    setSenha("");
  };

  const total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  return {
    // state
    tableName,
    originalTableName,
    cart,
    originalCart,
    existingOrderId,
    orderVersion,
    senha,
    total,
    itemCount,
    // setters/actions
    setTableName,
    setOriginalTableName,
    setSenha,
    setExistingOrderId,
    loadOrder,
    addToCart,
    updateQuantity,
    updateNote,
    removeItem,
    reset,
  };
};
