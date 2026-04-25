import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ShoppingBag, Printer, Wrench, BarChart3, Activity, Globe, ShoppingCart } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Order, Product } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";
import { useProductOrder } from "@/hooks/use-product-order";

import ProductForm from "@/components/admin/ProductForm";
import ProductsManager from "@/components/admin/ProductsManager";
import StatsPanel from "@/components/admin/StatsPanel";
import PrintConfigPanel from "@/components/admin/PrintConfigPanel";
import AdminHeader from "@/components/admin/AdminHeader";
import OrdersTab from "@/components/admin/OrdersTab";
import SystemTab from "@/components/admin/SystemTab";
import NetworkTab from "@/components/admin/NetworkTab";
import OnlineMenuTab from "@/components/admin/OnlineMenuTab";
import OnlineOrdersTab from "@/components/admin/OnlineOrdersTab";
import { manualPrintOrder } from "@/lib/print-service";

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
  const [activeTab, setActiveTab] = useState("products");
  const [staffMode, setStaffMode] = useState(
    () => localStorage.getItem("admin-staff-mode") === "true",
  );

  useEffect(() => {
    localStorage.setItem("admin-staff-mode", String(staffMode));
    if (staffMode && (activeTab === "stats" || activeTab === "system" || activeTab === "network")) {
      setActiveTab("products");
    }
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
    <div className={`min-h-screen-safe flex flex-col bg-slate-50/50 ${staffMode ? "staff-mode" : ""}`}>
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
        <div className="bg-white border-b border-border px-2 sm:px-4 overflow-x-auto">
          <TabsList className="bg-transparent h-14 gap-3 sm:gap-6 w-max">
            <TabsTrigger
              value="products"
              className="font-bold text-xs sm:text-sm h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-0 whitespace-nowrap"
            >
              Cardápio
            </TabsTrigger>
            <TabsTrigger
              value="online"
              className="font-bold text-xs sm:text-sm h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-0 flex gap-1.5 sm:gap-2 whitespace-nowrap"
            >
              <Globe className="w-4 h-4" /> <span className="hidden sm:inline">Cardápio </span>Online
            </TabsTrigger>
            <TabsTrigger
              value="orders"
              className="font-bold text-xs sm:text-sm h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-0 flex gap-1.5 sm:gap-2 whitespace-nowrap"
            >
              <ShoppingBag className="w-4 h-4" /> <span className="hidden sm:inline">Editor de </span>Pedidos
            </TabsTrigger>
            <TabsTrigger
              value="print"
              className="font-bold text-xs sm:text-sm h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-0 flex gap-1.5 sm:gap-2 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" /> Impressão
            </TabsTrigger>
            <TabsTrigger
              value="stats"
              className="admin-only font-bold text-xs sm:text-sm h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-0 flex gap-1.5 sm:gap-2 whitespace-nowrap"
            >
              <BarChart3 className="w-4 h-4" /> <span className="hidden sm:inline">Estatísticas</span><span className="sm:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger
              value="system"
              className="admin-only font-bold text-xs sm:text-sm h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-0 flex gap-1.5 sm:gap-2 whitespace-nowrap"
            >
              <Wrench className="w-4 h-4" /> Sistema
            </TabsTrigger>
            <TabsTrigger
              value="network"
              className="admin-only font-bold text-xs sm:text-sm h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-0 flex gap-1.5 sm:gap-2 whitespace-nowrap"
            >
              <Activity className="w-4 h-4" /> Rede
            </TabsTrigger>
          </TabsList>
        </div>

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

        <TabsContent value="online" className="flex-1 p-4 mt-0 bg-white border-t">
          <OnlineMenuTab />
        </TabsContent>

        <TabsContent value="print" className="flex-1 p-4 mt-0 bg-white border-t">
          <div className="max-w-2xl mx-auto py-4">
            <PrintConfigPanel />
          </div>
        </TabsContent>

        <TabsContent value="stats" className="flex-1 p-4 mt-0 bg-white border-t admin-only">
          <StatsPanel />
        </TabsContent>

        <TabsContent value="system" className="flex-1 p-4 mt-0 bg-white border-t admin-only">
          <SystemTab />
        </TabsContent>

        <TabsContent value="network" className="flex-1 p-4 mt-0 bg-white border-t admin-only">
          <NetworkTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;
