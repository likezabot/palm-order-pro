
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  ArrowLeft, Plus, Minus, Trash2, Save, Printer, 
  User, Phone, MapPin, Hash, Wallet, Clock, Info, Search,
  ShoppingBag, Bike, UtensilsCrossed
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { OrderEditorPreview } from "@/components/pdv/OrderEditorPreview";
import { Order, OrderItem, Product, OrderServiceType } from "@/lib/types";
import { formatTableLabel } from "@/lib/utils";
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function OrderEditor() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form states
  const [serviceType, setServiceType] = useState<OrderServiceType>("dine_in");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState({
    street: "",
    number: "",
    neighborhood: "",
    complement: "",
    reference: ""
  });
  const [items, setItems] = useState<Partial<OrderItem>[]>([]);
  const [observation, setObservation] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("none");
  const [tableName, setTableName] = useState("");
  const [waiterName, setWaiterName] = useState("");

  // Product selection
  const [openProductSearch, setOpenProductSearch] = useState(false);

  // Fetch products for addition
  const { data: products = [] } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    }
  });

  // Load existing order
  const { data: existingOrder, isLoading: isLoadingOrder } = useQuery({
    queryKey: ["order-edit", id],
    queryFn: async () => {
      if (!id || id === "new") return null;
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Order;
    },
    enabled: !!id && id !== "new"
  });

  // Load items
  const { data: existingItems, isLoading: isLoadingItems } = useQuery({
    queryKey: ["order-items-edit", id],
    queryFn: async () => {
      if (!id || id === "new") return [];
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id);
      if (error) throw error;
      return data as OrderItem[];
    },
    enabled: !!id && id !== "new"
  });

  // Populate form when data loads
  useEffect(() => {
    if (existingOrder) {
      setServiceType(existingOrder.service_type || "dine_in");
      setCustomerName(existingOrder.customer_name_snapshot || "");
      setCustomerPhone(existingOrder.customer_phone_snapshot || "");
      setTableName(existingOrder.table_name || "");
      setWaiterName(existingOrder.waiter_name || "");
      setPaymentMethod(existingOrder.payment_method || "none");
      if (existingOrder.delivery_address) {
        setAddress({
          street: existingOrder.delivery_address.street || "",
          number: existingOrder.delivery_address.number || "",
          neighborhood: existingOrder.delivery_address.neighborhood || "",
          complement: existingOrder.delivery_address.complement || "",
          reference: existingOrder.delivery_address.reference || ""
        });
      }
    } else if (id === "new") {
      const table = searchParams.get("table");
      if (table) setTableName(table);
      setWaiterName(localStorage.getItem("waiter_name") || "");
    }
  }, [existingOrder, id, searchParams]);

  useEffect(() => {
    if (existingItems && existingItems.length > 0) {
      // Find note item
      const noteItem = existingItems.find(it => it.product_name === "__order_note__");
      if (noteItem) {
        setObservation(noteItem.note || "");
      }
      setItems(existingItems.filter(it => it.product_name !== "__order_note__"));
    }
  }, [existingItems]);

  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  }, [items]);

  const handleAddItem = (product: Product) => {
    setItems(prev => {
      const existing = prev.find(it => it.product_id === product.id);
      if (existing) {
        return prev.map(it => it.product_id === product.id 
          ? { ...it, quantity: (it.quantity || 0) + 1, subtotal: ((it.quantity || 0) + 1) * product.price }
          : it
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        product_price: product.price,
        quantity: 1,
        subtotal: product.price,
        note: ""
      }];
    });
    setOpenProductSearch(false);
  };

  const updateItemQty = (productId: string | null, name: string, delta: number) => {
    setItems(prev => {
      return prev.map(it => {
        if (it.product_id === productId && it.product_name === name) {
          const newQty = Math.max(0, (it.quantity || 0) + delta);
          return { ...it, quantity: newQty, subtotal: newQty * (it.product_price || 0) };
        }
        return it;
      }).filter(it => it.quantity! > 0);
    });
  };

  const handleSave = async () => {
    if (!tableName && serviceType === "dine_in") {
      toast({ title: "Mesa é obrigatória", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Adicione ao menos um item", variant: "destructive" });
      return;
    }

    try {
      const orderPayload = {
        table_name: serviceType === "dine_in" ? tableName : (serviceType === "delivery" ? "ENTREGA" : "RETIRADA"),
        original_table_name: tableName || (serviceType === "delivery" ? "ENTREGA" : "RETIRADA"),
        service_type: serviceType,
        customer_name_snapshot: customerName || null,
        customer_phone_snapshot: customerPhone || null,
        delivery_address: serviceType === "delivery" ? address : null,
        payment_method: paymentMethod,
        total: total,
        waiter_name: waiterName || null,
        status: existingOrder?.status || "new",
        channel: existingOrder?.channel || "pdv"
      };

      let orderId = id;

      if (id === "new") {
        const { data, error } = await supabase
          .from("orders")
          .insert([orderPayload])
          .select()
          .single();
        if (error) throw error;
        orderId = data.id;
      } else {
        const { error } = await supabase
          .from("orders")
          .update(orderPayload)
          .eq("id", id!);
        if (error) throw error;
      }

      // Sync items
      // First remove all current items
      await supabase.from("order_items").delete().eq("order_id", orderId!);

      // Prepare items for insert
      const itemsToInsert = items.map(it => ({
        order_id: orderId!,
        product_id: it.product_id,
        product_name: it.product_name!,
        product_price: it.product_price!,
        quantity: it.quantity!,
        subtotal: it.subtotal!,
        note: it.note || null,
        waiter_name: waiterName || null
      }));

      // Add observation as a special item if exists
      if (observation.trim()) {
        itemsToInsert.push({
          order_id: orderId!,
          product_id: null,
          product_name: "__order_note__",
          product_price: 0,
          quantity: 1,
          subtotal: 0,
          note: observation.trim(),
          waiter_name: waiterName || null
        });
      }

      const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert);
      if (itemsError) throw itemsError;

      toast({ title: "Pedido salvo com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["pdv-orders"] });
      navigate("/pdv");
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
  };

  const previewInput = useMemo(() => ({
    docType: (serviceType === "delivery" ? "DELIVERY" : (serviceType === "pickup" ? "SENHA" : "PEDIDO")) as any,
    tableName: tableName || (serviceType === "delivery" ? "ENTREGA" : "RETIRADA"),
    waiterName,
    customerName,
    customerPhone,
    deliveryAddress: serviceType === "delivery" ? address : null,
    items: items.map(it => ({
      product_name: it.product_name!,
      quantity: it.quantity!,
      product_price: it.product_price!,
      note: it.note
    })),
    total,
    generalNote: observation,
    paymentMethod,
    serviceType,
    orderShortId: id?.slice(-6).toUpperCase()
  }), [serviceType, tableName, waiterName, customerName, customerPhone, address, items, total, observation, paymentMethod, id]);

  if (isLoadingOrder || isLoadingItems) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground font-medium">Carregando editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/pdv")}>
            <ArrowLeft size={24} />
          </Button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              {id === "new" ? "NOVO PEDIDO" : `EDITAR PEDIDO #${id?.slice(-6).toUpperCase()}`}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider">
              <Clock size={12} />
              {new Date().toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="lg" onClick={() => navigate("/pdv")} className="font-bold">
            CANCELAR
          </Button>
          <Button size="lg" onClick={handleSave} className="font-bold bg-success hover:bg-success/90 text-success-foreground px-8">
            <Save className="mr-2" size={20} />
            SALVAR PEDIDO
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_450px]">
        {/* Left: Editor */}
        <div className="overflow-y-auto p-6 space-y-8 bg-background/50">
          
          {/* Section: Type & Header */}
          <section className="space-y-4">
            <div className="flex gap-2">
              <Button 
                variant={serviceType === "dine_in" ? "default" : "outline"}
                className={`flex-1 h-14 text-base font-black uppercase tracking-wider transition-all ${serviceType === "dine_in" ? "ring-2 ring-primary ring-offset-2" : ""}`}
                onClick={() => setServiceType("dine_in")}
              >
                <Hash className="mr-2" size={18} />
                MESA / BALCÃO
              </Button>
              <Button 
                variant={serviceType === "pickup" ? "default" : "outline"}
                className={`flex-1 h-14 text-base font-black uppercase tracking-wider transition-all ${serviceType === "pickup" ? "ring-2 ring-primary ring-offset-2" : ""}`}
                onClick={() => setServiceType("pickup")}
              >
                <ShoppingBag className="mr-2" size={18} />
                RETIRADA
              </Button>
              <Button 
                variant={serviceType === "delivery" ? "default" : "outline"}
                className={`flex-1 h-14 text-base font-black uppercase tracking-wider transition-all ${serviceType === "delivery" ? "ring-2 ring-primary ring-offset-2" : ""}`}
                onClick={() => setServiceType("delivery")}
              >
                <Bike className="mr-2" size={18} />
                ENTREGA
              </Button>
            </div>

            {serviceType === "dine_in" && (
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2 block">Identificação da Mesa</Label>
                <Input 
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value.toUpperCase())}
                  placeholder="EX: MESA 01, BALCÃO..."
                  className="h-12 text-lg font-bold border-2 focus-visible:ring-primary"
                />
              </div>
            )}
          </section>

          {/* Section: Customer */}
          <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="bg-muted/30 px-4 py-2 border-b border-border">
              <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <User size={14} />
                Dados do Cliente
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Nome</Label>
                  <Input 
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nome do cliente"
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Telefone</Label>
                  <Input 
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="h-11"
                  />
                </div>
              </div>

              {serviceType === "delivery" && (
                <div className="pt-4 border-t border-border space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase text-muted-foreground">Rua / Logradouro</Label>
                      <Input 
                        value={address.street}
                        onChange={(e) => setAddress(prev => ({ ...prev, street: e.target.value }))}
                        placeholder="Nome da rua"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase text-muted-foreground">Número</Label>
                      <Input 
                        value={address.number}
                        onChange={(e) => setAddress(prev => ({ ...prev, number: e.target.value }))}
                        placeholder="Nº"
                        className="h-11"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase text-muted-foreground">Bairro</Label>
                      <Input 
                        value={address.neighborhood}
                        onChange={(e) => setAddress(prev => ({ ...prev, neighborhood: e.target.value }))}
                        placeholder="Bairro"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase text-muted-foreground">Complemento</Label>
                      <Input 
                        value={address.complement}
                        onChange={(e) => setAddress(prev => ({ ...prev, complement: e.target.value }))}
                        placeholder="Apto, Bloco..."
                        className="h-11"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Ponto de Referência</Label>
                    <Input 
                      value={address.reference}
                      onChange={(e) => setAddress(prev => ({ ...prev, reference: e.target.value }))}
                      placeholder="Próximo a..."
                      className="h-11"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Section: Items */}
          <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="bg-muted/30 px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <UtensilsCrossed size={14} />
                Itens do Pedido
              </h2>
              <Badge variant="secondary" className="font-black tabular-nums">{items.length} ITENS</Badge>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                {items.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground border-2 border-dashed border-border rounded-xl italic text-sm">
                    Nenhum item adicionado. Clique abaixo para começar.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div key={`${item.product_id}-${idx}`} className="flex items-center gap-3 p-3 bg-secondary/30 rounded-xl border border-border/50 group transition-all hover:bg-secondary/50">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-base truncate">{item.product_name}</div>
                          <div className="text-xs text-muted-foreground font-medium">R$ {item.product_price?.toFixed(2)} unit.</div>
                          <Input 
                            value={item.note || ""}
                            onChange={(e) => {
                              const newNote = e.target.value;
                              setItems(prev => prev.map((it, i) => i === idx ? { ...it, note: newNote } : it));
                            }}
                            placeholder="Adicionar observação no item..."
                            className="mt-2 h-8 text-[11px] bg-background/50 border-none shadow-none focus-visible:ring-1"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-background rounded-lg border border-border overflow-hidden">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 rounded-none hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => updateItemQty(item.product_id!, item.product_name!, -1)}
                            >
                              <Minus size={14} />
                            </Button>
                            <span className="w-10 text-center font-black tabular-nums text-sm">{item.quantity}</span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 rounded-none hover:bg-success/10 hover:text-success"
                              onClick={() => updateItemQty(item.product_id!, item.product_name!, 1)}
                            >
                              <Plus size={14} />
                            </Button>
                          </div>
                          
                          <div className="w-24 text-right font-black text-foreground tabular-nums">
                            R$ {item.subtotal?.toFixed(2)}
                          </div>

                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => updateItemQty(item.product_id!, item.product_name!, -(item.quantity || 0))}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
                <PopoverTrigger asChild>
                  <Button className="w-full h-14 text-base font-black uppercase tracking-wider gap-2 shadow-lg" size="lg">
                    <Plus size={20} />
                    ADICIONAR ITEM
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[400px]" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar produto..." className="h-12" />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                      <CommandGroup heading="Produtos Disponíveis">
                        {products.map((product) => (
                          <CommandItem
                            key={product.id}
                            value={product.name}
                            onSelect={() => handleAddItem(product)}
                            className="p-3 flex items-center justify-between cursor-pointer"
                          >
                            <div className="flex flex-col">
                              <span className="font-bold">{product.name}</span>
                              <span className="text-xs text-muted-foreground uppercase">{product.category}</span>
                            </div>
                            <span className="font-black text-primary">R$ {product.price.toFixed(2)}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </section>

          {/* Section: Observation */}
          <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="bg-muted/30 px-4 py-2 border-b border-border">
              <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Info size={14} />
                Observação do Pedido
              </h2>
            </div>
            <div className="p-4">
              <Textarea 
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Ex: Tocar campainha, retirar cebola de todos os itens..."
                className="min-h-[80px] text-sm"
              />
            </div>
          </section>

          {/* Section: Payment */}
          <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="bg-muted/30 px-4 py-2 border-b border-border">
              <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Wallet size={14} />
                Pagamento
              </h2>
            </div>
            <div className="p-4 flex items-center justify-between gap-6">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Forma de Pagamento</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-12 font-bold uppercase">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="font-bold">A DEFINIR</SelectItem>
                    <SelectItem value="cash" className="font-bold">DINHEIRO</SelectItem>
                    <SelectItem value="card" className="font-bold">CARTÃO</SelectItem>
                    <SelectItem value="pix" className="font-bold">PIX</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="text-right space-y-1">
                <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Total do Pedido</div>
                <div className="text-4xl font-black text-primary tabular-nums tracking-tighter">
                  R$ {total.toFixed(2)}
                </div>
              </div>
            </div>
          </section>

          <div className="h-20" /> {/* Spacer */}
        </div>

        {/* Right: Preview */}
        <div className="border-l border-border bg-zinc-50 overflow-hidden flex flex-col">
          <OrderEditorPreview input={previewInput} />
        </div>
      </main>
      
      <style dangerouslySetInnerHTML={{ __html: `
        .thermal-preview-container * {
          font-family: 'Courier New', Courier, monospace !important;
          line-height: 1.2 !important;
        }
        .thermal-preview-container .center { text-align: center; }
        .thermal-preview-container .bold { font-weight: bold; }
        .thermal-preview-container .hr { border-top: 1px dashed #ccc; margin: 4px 0; }
        .thermal-preview-container .item-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px; }
      `}} />
    </div>
  );
}

