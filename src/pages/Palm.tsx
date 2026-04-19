import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import MenuView from "@/components/palm/MenuView";
import OrderReview from "@/components/palm/OrderReview";
import OrderSuccess from "@/components/palm/OrderSuccess";
import TableGrid from "@/components/palm/TableGrid";
import CloseOrder from "@/components/cashier/CloseOrder";
import { CartItem, Order } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";
import { supabase } from "@/integrations/supabase/client";

type Step = "grid" | "menu" | "review" | "success" | "close";

const Palm = () => {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>("grid");
  const [tableName, setTableName] = useState("");
  const [originalTableName, setOriginalTableName] = useState("");
  const [waiterName, setWaiterName] = useState(() => localStorage.getItem("waiter_name") || "");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [originalCart, setOriginalCart] = useState<CartItem[]>([]);
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [orderVersion, setOrderVersion] = useState<number | null>(null);
  const [senha, setSenha] = useState("");
  const { playFeedback } = useFeedback();

  useEffect(() => {
    localStorage.setItem("waiter_name", waiterName);
  }, [waiterName]);

  const handleSelectTable = useCallback(async (name: string, orderId?: string) => {
    setTableName(name);
    setOriginalTableName(name);
    setSenha("");
    setCart([]);
    setOriginalCart([]);
    setExistingOrderId(orderId ?? null);
    setOrderVersion(null);

    if (orderId) {
      // Load version + table_name + original (pode ter sido renomeado)
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

      // Load existing order items into cart
      const { data: items } = await supabase
        .from("order_items")
        .select("product_id, product_name, product_price, quantity, note")
        .eq("order_id", orderId);

      if (items && items.length > 0) {
        const loadedCart: CartItem[] = items.map((item) => ({
          product: {
            id: item.product_id || item.product_name,
            name: item.product_name,
            price: item.product_price,
            category: "",
            active: true,
            created_at: "",
          },
          quantity: item.quantity,
          note: item.note || "",
        }));
        setCart(loadedCart);
        // Guardar snapshot dos itens originais para cálculo de delta
        setOriginalCart(loadedCart.map(i => ({ ...i, product: { ...i.product } })));
        setExistingOrderId(orderId);
      }
    }

    setStep("menu");
  }, []);

  useEffect(() => {
    const orderId = searchParams.get("orderId");
    const table = searchParams.get("tableName");
    if (orderId && table) {
      handleSelectTable(table, orderId);
    }
  }, [searchParams, handleSelectTable]);

  const addToCart = (product: CartItem["product"]) => {
    playFeedback("click");
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1, note: "" }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    playFeedback("click");
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const updateNote = (productId: string, note: string) => {
    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, note } : i))
    );
  };

  const removeItem = (productId: string) => {
    playFeedback("heavy");
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  const resetOrder = () => {
    playFeedback("notification");
    setCart([]);
    setOriginalCart([]);
    setTableName("");
    setOriginalTableName("");
    setExistingOrderId(null);
    setOrderVersion(null);
    setSenha("");
    setStep("grid");
  };

  if (step === "close" && existingOrderId) {
    const closeOrder: Order = {
      id: existingOrderId,
      table_name: tableName,
      waiter_name: waiterName,
      total,
      status: "done",
      created_at: "",
      updated_at: "",
      payment_method: null,
      amount_paid: null,
    };
    return (
      <CloseOrder
        order={closeOrder}
        onBack={() => setStep("review")}
        onClosed={resetOrder}
      />
    );
  }

  if (step === "success") {
    return (
      <OrderSuccess
        onReset={resetOrder}
        senha={senha}
        cart={cart}
        allowLocalPrint={tableName === "BALCÃO" && !existingOrderId}
      />
    );
  }

  if (step === "review") {
    return (
      <OrderReview
        tableName={tableName}
        waiterName={waiterName}
        cart={cart}
        originalCart={originalCart}
        total={total}
        existingOrderId={existingOrderId}
        orderVersion={orderVersion}
        senha={senha}
        onBack={() => setStep("menu")}
        onUpdateQuantity={updateQuantity}
        onUpdateNote={updateNote}
        onRemove={removeItem}
        onSuccess={(s: string) => {
          setSenha(s);
          setStep("success");
        }}
        onCloseAccount={() => setStep("close")}
        onRedirectToExisting={(name, orderId) => {
          handleSelectTable(name, orderId);
        }}
      />
    );
  }

  if (step === "menu") {
    return (
      <MenuView
        onAdd={addToCart}
        cart={cart}
        total={total}
        itemCount={itemCount}
        tableName={tableName}
        originalTableName={originalTableName}
        onRenameTable={async (newName: string) => {
          const trimmed = newName.trim();
          if (!trimmed || trimmed === tableName) return;
          if (existingOrderId) {
            const { error } = await supabase.rpc("rename_order_table", {
              p_order_id: existingOrderId,
              p_new_name: trimmed,
            });
            if (error) {
              console.error("[Palm] rename_order_table error:", error);
              return;
            }
          }
          setTableName(trimmed);
        }}
        onViewCart={() => setStep("review")}
        onBack={() => {
          setStep("grid");
          setTableName("");
          setOriginalTableName("");
          setCart([]);
          setOriginalCart([]);
          setExistingOrderId(null);
          setOrderVersion(null);
          setSenha("");
        }}
      />
    );
  }

  return (
    <TableGrid
      waiterName={waiterName}
      onSetWaiter={setWaiterName}
      onSelectTable={handleSelectTable}
    />
  );
};

export default Palm;