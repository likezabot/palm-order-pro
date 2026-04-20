import { useCallback, useState } from "react";
import { CartItem } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { useFeedback } from "@/hooks/use-feedback";

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
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [orderVersion, setOrderVersion] = useState<number | null>(null);
  const [senha, setSenha] = useState("");

  const loadOrder = useCallback(async (name: string, orderId?: string) => {
    setTableName(name);
    setOriginalTableName(name);
    setSenha("");
    setCart([]);
    setOriginalCart([]);
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

    const { data: items } = await supabase
      .from("order_items")
      .select("product_id, product_name, product_price, quantity, note, waiter_name")
      .eq("order_id", orderId);

    if (items && items.length > 0) {
      // Dedupe linhas iguais (mesmo product_id+note+waiter) somando quantidade,
      // para evitar "1x Coca por João" + "1x Coca por João" duplicado vindo do banco.
      const dedupeMap = new Map<string, CartItem>();
      for (const item of items) {
        const waiter = (item as any).waiter_name || undefined;
        const note = item.note || "";
        const productId = item.product_id || item.product_name;
        const key = `${productId}|${note}|${waiter || ""}`;
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
      }
      const loadedCart: CartItem[] = Array.from(dedupeMap.values());
      setCart(loadedCart);
      setOriginalCart(loadedCart.map((i) => ({ ...i, product: { ...i.product } })));
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
