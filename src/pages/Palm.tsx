import { useState, useEffect } from "react";
import TableSelect from "@/components/palm/TableSelect";
import AtendimentoChoice from "@/components/palm/AtendimentoChoice";
import OpenTablesSelect from "@/components/palm/OpenTablesSelect";
import MenuView from "@/components/palm/MenuView";
import OrderReview from "@/components/palm/OrderReview";
import OrderSuccess from "@/components/palm/OrderSuccess";
import { CartItem } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";

type Step = "choice" | "table" | "open_tables" | "menu" | "review" | "success";

const Palm = () => {
  const [step, setStep] = useState<Step>("choice");
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
    setStep("choice");
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
          if (tableName === "BALCÃO") {
            setStep("choice");
          } else {
            // Se veio de mesa_atendida, volta para open_tables. 
            // Mas como sabemos se veio de open_tables? 
            // Podemos checar se a mesa foi selecionada via Step.
            // Para simplificar, se houver tableName, volta para choice ou tenta inferir.
            // Melhor: se o step anterior era open_tables, voltar para open_tables.
            // Vamos apenas voltar para choice por enquanto ou table se for nova mesa.
            setStep("choice");
          }
        }}
      />
    );
  }

  if (step === "open_tables") {
    return (
      <OpenTablesSelect
        onSelect={(name) => {
          setTableName(name);
          setStep("menu");
        }}
        onBack={() => setStep("choice")}
      />
    );
  }

  if (step === "choice") {
    return (
      <AtendimentoChoice
        onSelect={(type) => {
          if (type === "balcao") {
            setTableName("BALCÃO");
            setStep("menu");
          } else if (type === "mesa_atendida") {
            setStep("open_tables");
          } else {
            setStep("table");
          }
        }}
      />
    );
  }

  return (
    <TableSelect
      tableName={tableName}
      setTableName={setTableName}
      waiterName={waiterName}
      setWaiterName={setWaiterName}
      onStart={() => setStep("menu")}
      onBack={() => setStep("choice")}
    />
  );
};

export default Palm;