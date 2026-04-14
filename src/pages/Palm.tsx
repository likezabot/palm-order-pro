import { useState, useEffect, useMemo } from "react";
import MenuView from "@/components/palm/MenuView";
import OrderReview from "@/components/palm/OrderReview";
import OrderSuccess from "@/components/palm/OrderSuccess";
import TableGrid from "@/components/palm/TableGrid";
import { CartItem } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

type Step = "grid" | "menu" | "review" | "success";

const Palm = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("grid");
  const [tableName, setTableName] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const { playFeedback } = useFeedback();

  const userProfile = useMemo(() => {
    const data = localStorage.getItem("user_profile");
    if (!data) return null;
    return JSON.parse(data);
  }, []);

  useEffect(() => {
    if (!userProfile) {
      navigate("/");
    }
  }, [userProfile, navigate]);

  const waiterName = userProfile?.name || "Garçom";

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
    setSenha("");
    setStep("grid");
  };

  const handleSelectTable = async (name: string, orderId?: string) => {
    setTableName(name);

    if (orderId) {
      const { data: items } = await supabase
        .from("order_items")
        .select("product_id, product_name, product_price, quantity, note")
        .eq("order_id", orderId);

      if (items && items.length > 0) {
        // Fetch full product data to get stock info
        const { data: products } = await supabase.from("products").select("*");
        
        const loadedCart: CartItem[] = items.map((item) => {
          const fullProduct = products?.find(p => p.id === item.product_id);
          return {
            product: fullProduct || {
              id: item.product_id || item.product_name,
              name: item.product_name,
              price: item.product_price,
              category: "",
              active: true,
              created_at: "",
            },
            quantity: item.quantity,
            note: item.note || "",
          };
        });
        setCart(loadedCart);
        setExistingOrderId(orderId);
      }
    }

    setStep("menu");
  };

  if (step === "success") {
    return <OrderSuccess onReset={resetOrder} senha={senha} cart={cart} />;
  }

  if (step === "review") {
    return (
      <OrderReview
        tableName={tableName}
        waiterName={waiterName}
        cart={cart}
        total={total}
        existingOrderId={existingOrderId}
        senha={senha}
        onBack={() => setStep("menu")}
        onUpdateQuantity={updateQuantity}
        onUpdateNote={updateNote}
        onRemove={removeItem}
        onSuccess={(s: string) => {
          setSenha(s);
          setStep("success");
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

  if (!userProfile) return null;

  return (
    <div className="bg-[#1a1a1a] min-h-screen">
      <TableGrid
        waiterName={waiterName}
        onSetWaiter={() => {}} // No longer editable here
        onSelectTable={handleSelectTable}
      />
    </div>
  );
};

export default Palm;
