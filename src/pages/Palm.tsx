import { useState, useEffect } from "react";
import MenuView from "@/components/palm/MenuView";
import OrderReview from "@/components/palm/OrderReview";
import OrderSuccess from "@/components/palm/OrderSuccess";
import TableGrid from "@/components/palm/TableGrid";
import { CartItem } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";
import { supabase } from "@/integrations/supabase/client";

type Step = "grid" | "menu" | "review" | "success";

const Palm = () => {
  const [step, setStep] = useState<Step>("grid");
  const [tableName, setTableName] = useState("");
  const [waiterName, setWaiterName] = useState(() => localStorage.getItem("waiter_name") || "");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const { playFeedback } = useFeedback();

  useEffect(() => {
    localStorage.setItem("waiter_name", waiterName);
  }, [waiterName]);

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
    setTableName("");
    setExistingOrderId(null);
    setStep("grid");
  };

  const handleSelectTable = async (name: string, orderId?: string) => {
    setTableName(name);

    if (orderId) {
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
        setExistingOrderId(orderId);
      }
    }

    setStep("menu");
  };

  if (step === "success") {
    return <OrderSuccess onReset={resetOrder} />;
  }

  if (step === "review") {
    return (
      <OrderReview
        tableName={tableName}
        waiterName={waiterName}
        cart={cart}
        total={total}
        existingOrderId={existingOrderId}
        onBack={() => setStep("menu")}
        onUpdateQuantity={updateQuantity}
        onUpdateNote={updateNote}
        onRemove={removeItem}
        onSuccess={() => setStep("success")}
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
        onViewCart={() => setStep("review")}
        onBack={() => {
          setStep("grid");
          setTableName("");
          setCart([]);
          setExistingOrderId(null);
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
