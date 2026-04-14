import { useState, useEffect } from "react";
import MenuView from "@/components/palm/MenuView";
import OrderReview from "@/components/palm/OrderReview";
import OrderSuccess from "@/components/palm/OrderSuccess";
import TableGrid from "@/components/palm/TableGrid";
import { CartItem } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";

type Step = "grid" | "menu" | "review" | "success";

const Palm = () => {
  const [step, setStep] = useState<Step>("grid");
  const [tableName, setTableName] = useState("");
  const [waiterName, setWaiterName] = useState(() => localStorage.getItem("waiter_name") || "");
  const [cart, setCart] = useState<CartItem[]>([]);
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
    setStep("grid");
  };

  const handleSelectTable = (name: string) => {
    setTableName(name);
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
