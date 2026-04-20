import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MenuView from "@/components/palm/MenuView";
import OrderReview from "@/components/palm/OrderReview";
import OrderSuccess from "@/components/palm/OrderSuccess";
import TableGrid from "@/components/palm/TableGrid";
import CloseOrder from "@/components/cashier/CloseOrder";
import { Order } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { usePalmCart } from "@/hooks/use-palm-cart";

type Step = "grid" | "menu" | "review" | "success" | "close";

const Palm = () => {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>("grid");
  const [waiterName, setWaiterName] = useState(
    () => localStorage.getItem("waiter_name") || "",
  );
  const cartState = usePalmCart();
  const {
    tableName,
    originalTableName,
    cart,
    originalCart,
    existingOrderId,
    orderVersion,
    senha,
    total,
    itemCount,
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
  } = cartState;

  useEffect(() => {
    localStorage.setItem("waiter_name", waiterName);
  }, [waiterName]);

  const handleSelectTable = async (name: string, orderId?: string) => {
    await loadOrder(name, orderId);
    setStep("menu");
  };

  useEffect(() => {
    const orderId = searchParams.get("orderId");
    const table = searchParams.get("tableName");
    if (orderId && table) {
      handleSelectTable(table, orderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const resetOrder = () => {
    reset();
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
      <CloseOrder order={closeOrder} onBack={() => setStep("review")} onClosed={resetOrder} />
    );
  }

  if (step === "success") {
    return (
      <OrderSuccess
        onReset={resetOrder}
        senha={senha}
        cart={cart}
        allowLocalPrint={tableName === "BALCÃO" && !existingOrderId}
        waiterName={waiterName}
        orderId={existingOrderId ?? undefined}
      />
    );
  }

  if (step === "review") {
    return (
      <OrderReview
        tableName={tableName}
        originalTableName={originalTableName}
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
        onSuccess={(s: string, newOrderId?: string) => {
          setSenha(s);
          if (newOrderId) setExistingOrderId(newOrderId);
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
        onAdd={(product) => addToCart(product, waiterName)}
        cart={cart}
        total={total}
        itemCount={itemCount}
        tableName={tableName}
        originalTableName={originalTableName}
        existingOrderId={existingOrderId}
        onTableMoved={(newTable) => {
          setTableName(newTable);
          setOriginalTableName(newTable);
        }}
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
          resetOrder();
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
