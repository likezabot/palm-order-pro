import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import { supabase } from "@/integrations/supabase/client";
import { Order, Product } from "@/lib/types";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";
import { useProductOrder } from "@/hooks/use-product-order";

import ProductForm from "@/components/admin/ProductForm";
import ProductsManager from "@/components/admin/ProductsManager";
import StatsPanel from "@/components/admin/StatsPanel";
import PrintConfigPanel from "@/components/admin/PrintConfigPanel";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminSidebar from "@/components/admin/AdminSidebar";
import OrdersTab from "@/components/admin/OrdersTab";
import SystemTab from "@/components/admin/SystemTab";
import ErrorsTab from "@/components/admin/ErrorsTab";
import NetworkTab from "@/components/admin/NetworkTab";
import OnlineMenuTab from "@/components/admin/OnlineMenuTab";
import OnlineOrdersTab from "@/components/admin/OnlineOrdersTab";
import RoutesTab from "@/components/admin/RoutesTab";
import LoyaltyTab from "@/components/admin/LoyaltyTab";
import { manualPrintOrder } from "@/lib/print-service";

const VALID_SECTIONS = new Set([
  "products",
  "online",
  "loyalty",
  "orders",
  "online-orders",
  "print",
  "network",
  "routes",
  "errors",
  "stats",
  "system",
]);

const Admin = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playFeedback } = useFeedback();
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formInitialCategory, setFormInitialCategory] = useState<string | undefined>(undefined);
  const [autoPrint, setAutoPrint] = useState(
    () => localStorage.getItem("pdv_autoprint") !== "false",
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSection = searchParams.get("section") ?? "products";
  const activeTab = VALID_SECTIONS.has(rawSection) ? rawSection : "products";
  const setActiveTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("section", next);
    setSearchParams(params, { replace: true });
  };

  const [staffMode, setStaffMode] = useState(
    () => localStorage.getItem("admin-staff-mode") === "true",
  );

  useEffect(() => {
    localStorage.setItem("admin-staff-mode", String(staffMode));
    if (staffMode && (activeTab === "stats" || activeTab === "system" || activeTab === "network" || activeTab === "errors" || activeTab === "routes")) {
      setActiveTab("products");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffMode, activeTab]);

  useEffect(() => {
    localStorage.setItem("pdv_autoprint", String(autoPrint));
  }, [autoPrint]);

  // Realtime: produtos alterados pelo bot do Telegram aparecem no Admin sem refresh.
  useEffect(() => {
    const ch = supabase
      .channel("admin-products-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("category")
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: activeOrders = [] } = useQuery({
    queryKey: ["admin-active-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["new", "preparing", "done"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
    refetchInterval: 30_000,
  });

  // Contagem leve de erros não resolvidos das últimas 24h para badge na aba "Erros"
  const { data: unresolvedErrors = 0 } = useQuery({
    queryKey: ["admin-unresolved-errors-count"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("error_log" as never)
        .select("*", { count: "exact", head: true })
        .eq("resolved", false)
        .gte("occurred_at", since);
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { orderMap, productsByCategory, handleDragEnd, handleResetOrder } =
    useProductOrder(products);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este produto?")) return;
    playFeedback("heavy");
    const { withPin } = await import("@/lib/manager-pin");
    const ok = await withPin(async (pin) => {
      const { error } = await supabase.rpc("admin_delete_product", { p_pin: pin, p_id: id });
      if (error) throw error;
      return true;
    }, "Excluir produto");
    if (!ok) return;
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    toast({ title: "Produto excluído" });
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    playFeedback("click");
    const { error } = await supabase.rpc("toggle_product_active", {
      p_id: id,
      p_active: !current,
    });

    if (error) {
      playFeedback("error");
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
        description: error.message,
      });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    toast({ title: !current ? "Item ativado no cardápio" : "Item removido do cardápio" });
  };

  const handleEdit = (product: Product) => {
    playFeedback("click");
    setEditing(product);
    setShowForm(true);
  };

  const handleSaved = () => {
    playFeedback("success");
    setShowForm(false);
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
  };

  const handlePrintOrder = async (order: Order) => {
    playFeedback("click");
    const success = await manualPrintOrder(order);
    if (success) {
      toast({ title: `Imprimindo Mesa ${order.table_name}` });
    }
  };

  const handleEditOrder = (order: Order) => {
    playFeedback("click");
    navigate(`/palm?orderId=${order.id}&tableName=${order.table_name}`);
  };

  if (showForm) {
    return (
      <ProductForm
        product={editing}
        initialCategory={formInitialCategory}
        onBack={() => {
          playFeedback("click");
          setShowForm(false);
          setEditing(null);
          setFormInitialCategory(undefined);
        }}
        onSaved={() => {
          handleSaved();
          setFormInitialCategory(undefined);
        }}
      />
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <div className={`min-h-screen-safe flex w-full ${staffMode ? "staff-mode" : ""}`}>
        <AdminSidebar
          active={activeTab}
          onChange={setActiveTab}
          staffMode={staffMode}
          unresolvedErrors={unresolvedErrors}
        />

        <SidebarInset className="flex flex-col bg-slate-50/50 min-w-0">
          <AdminHeader
            staffMode={staffMode}
            onToggleStaffMode={() => setStaffMode((v) => !v)}
            autoPrint={autoPrint}
            onAutoPrintChange={setAutoPrint}
            onNewProduct={() => {
              setEditing(null);
              setFormInitialCategory(undefined);
              setShowForm(true);
            }}
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsContent value="products" className="flex-1 mt-0 flex flex-col">
              <ProductsManager
                productsByCategory={productsByCategory}
                orderMap={orderMap}
                sensors={sensors}
                onDragEnd={handleDragEnd}
                onResetOrder={handleResetOrder}
                onToggleActive={handleToggleActive}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onNewProduct={(cat) => {
                  playFeedback("click");
                  setEditing(null);
                  setFormInitialCategory(cat);
                  setShowForm(true);
                }}
              />
            </TabsContent>

            <TabsContent value="orders" className="flex-1 p-4 space-y-3 mt-0">
              <OrdersTab orders={activeOrders} onPrint={handlePrintOrder} onEdit={handleEditOrder} />
            </TabsContent>

            <TabsContent value="online" className="flex-1 p-4 mt-0 bg-white">
              <OnlineMenuTab />
            </TabsContent>

            <TabsContent value="online-orders" className="flex-1 p-4 mt-0 bg-white">
              <OnlineOrdersTab />
            </TabsContent>

            <TabsContent value="print" className="flex-1 p-4 mt-0 bg-white">
              <div className="max-w-2xl mx-auto py-4">
                <PrintConfigPanel />
              </div>
            </TabsContent>

            <TabsContent value="stats" className="flex-1 p-4 mt-0 bg-white admin-only">
              <StatsPanel />
            </TabsContent>

            <TabsContent value="errors" className="flex-1 p-4 mt-0 bg-white admin-only">
              <ErrorsTab />
            </TabsContent>

            <TabsContent value="system" className="flex-1 p-4 mt-0 bg-white admin-only">
              <SystemTab />
            </TabsContent>

            <TabsContent value="network" className="flex-1 p-4 mt-0 bg-white admin-only">
              <NetworkTab />
            </TabsContent>

            <TabsContent value="routes" className="flex-1 p-4 mt-0 bg-white admin-only">
              <RoutesTab />
            </TabsContent>

            <TabsContent value="loyalty" className="flex-1 p-4 mt-0 bg-white">
              <LoyaltyTab />
            </TabsContent>
          </Tabs>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Admin;
