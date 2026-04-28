import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Gift, 
  UserCheck, 
  Loader2, 
  MapPin, 
  Phone, 
  User, 
  Truck, 
  ShoppingBag, 
  CreditCard, 
  MessageSquare,
  AlertCircle,
  Info
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { usePreviewMode } from "@/hooks/use-preview-mode";
import {
  usePublicCart,
  newClientRequestId,
  createPublicOrder,
  validatePhone,
  formatPhone,
  computeDeliveryFee,
  fetchCustomerProfile,
  DELIVERY_FEE_FIXED,
  type ServiceType,
  type PaymentMethod,
} from "@/lib/public-cart";
import { fetchCurrentRestaurant, fetchRestaurantBySlug } from "@/lib/public-menu";
import { fetchLoyaltyStatus, normalizePhoneClient } from "@/lib/loyalty";
import { logError, extractErrorCode } from "@/lib/error-log";
import LoyaltySection from "@/components/public-menu/LoyaltySection";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PHONE_KEY = "pb_loyalty_phone";
const REWARD_KEY = "pb_pending_reward";
const CART_STORAGE_KEY = "public_cart_v1";

function isValidRestaurantSlug(value?: string): boolean {
  const slug = (value ?? "").trim();
  return !!slug && slug !== ":slug" && !slug.includes(":") && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug);
}

export default function PublicCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const { toast } = useToast();
  const cart = usePublicCart();
  const isPreview = usePreviewMode();
  const routeSlug = (slug ?? "").trim();
  const hasValidRouteSlug = isValidRestaurantSlug(routeSlug);

  const restaurantQuery = useQuery({
    queryKey: ["pmenu", "restaurant", routeSlug],
    queryFn: () => fetchRestaurantBySlug(routeSlug),
    enabled: hasValidRouteSlug,
    staleTime: 60_000,
  });

  const currentRestaurantQuery = useQuery({
    queryKey: ["pmenu", "restaurant", "current"],
    queryFn: fetchCurrentRestaurant,
    enabled: !hasValidRouteSlug || (!restaurantQuery.isLoading && !restaurantQuery.data),
    staleTime: 60_000,
  });

  const restaurant = restaurantQuery.data ?? currentRestaurantQuery.data ?? null;
  const resolvedSlug = restaurant?.slug ?? (hasValidRouteSlug ? routeSlug : "");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>("pickup");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [changeFor, setChangeFor] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [complement, setComplement] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loyaltyRewardId, setLoyaltyRewardId] = useState<string | null>(null);
  const [pendingRewardId, setPendingRewardId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pré-preenche telefone via localStorage e brinde via sessionStorage
  useEffect(() => {
    try {
      const savedPhone =
        sessionStorage.getItem(PHONE_KEY) || localStorage.getItem(PHONE_KEY);
      if (savedPhone) setPhone(formatPhone(savedPhone));
      const pending = sessionStorage.getItem(REWARD_KEY);
      if (pending) setPendingRewardId(pending);
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-preenche dados do cliente pelo telefone
  const [customerFound, setCustomerFound] = useState<any>(null);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showAddressFoundCard, setShowAddressFoundCard] = useState(false);
  const lastFetchedPhoneRef = useRef<string>("");

  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    const lookupKey = `${resolvedSlug}:${digits}`;
    if (digits.length < 10 || !resolvedSlug) {
      lastFetchedPhoneRef.current = "";
      setCustomerFound(null);
      setShowAddressFoundCard(false);
      return;
    }
    if (lastFetchedPhoneRef.current === lookupKey) return;

    const handle = setTimeout(async () => {
      lastFetchedPhoneRef.current = lookupKey;
      setSearchingCustomer(true);
      try {
        const profile = await fetchCustomerProfile(digits, resolvedSlug);
        if (profile) {
          setCustomerFound(profile);
          
          if (!name.trim() && profile.name) {
            setName(profile.name);
          }
          
          const hasSavedAddress = !!(profile.street && profile.number && profile.neighborhood);
          const currentAddressEmpty = !street.trim() && !number.trim() && !neighborhood.trim();
          
          // Se encontrou endereço e o atual está vazio, mostra o card discreto
          if (hasSavedAddress && currentAddressEmpty) {
            setShowAddressFoundCard(true);
          } else {
            setShowAddressFoundCard(false);
          }

          // Não altera serviceType nem paymentMethod automaticamente
          // Mantém a escolha atual do usuário como solicitado
        } else {
          setCustomerFound(null);
          setShowAddressFoundCard(false);
        }
      } catch (err) {
        console.error("Erro ao buscar cliente:", err);
      } finally {
        setSearchingCustomer(false);
      }
    }, 600);

    return () => clearTimeout(handle);
  }, [phone, resolvedSlug, name, street, number, neighborhood]);

  const [requestId] = useState(() => newClientRequestId());

  const subtotal = cart.subtotal;
  const deliveryFee = computeDeliveryFee(serviceType);
  const total = subtotal + deliveryFee;

  const phoneDigits = normalizePhoneClient(phone);
  const phoneOk = phoneDigits.length >= 10;
  
  const loyaltyQuery = useQuery({
    queryKey: ["loyalty-status", resolvedSlug, phoneDigits, subtotal, serviceType],
    queryFn: () =>
      fetchLoyaltyStatus({
        phone: phoneDigits,
        restaurantSlug: resolvedSlug,
        orderSubtotal: subtotal,
        serviceType,
      }),
    enabled: phoneOk && !!resolvedSlug,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!pendingRewardId || !loyaltyQuery.data?.enabled) return;
    const reward = loyaltyQuery.data.rewards.find((r) => r.id === pendingRewardId);
    if (reward && reward.available) {
      setLoyaltyRewardId(pendingRewardId);
      setPendingRewardId(null);
    }
  }, [pendingRewardId, loyaltyQuery.data, serviceType]);

  const selectedReward = useMemo(() => {
    if (!loyaltyRewardId || !loyaltyQuery.data) return null;
    return loyaltyQuery.data.rewards.find((r) => r.id === loyaltyRewardId) ?? null;
  }, [loyaltyRewardId, loyaltyQuery.data]);

  const canSubmit = useMemo(() => {
    if (cart.items.length === 0) return false;
    if (!name.trim()) return false;
    if (!validatePhone(phone)) return false;
    if (serviceType === "delivery") {
      if (!street.trim() || !number.trim() || !neighborhood.trim()) return false;
    }
    return true;
  }, [cart.items.length, name, phone, serviceType, street, number, neighborhood]);

  if (cart.items.length === 0 && !submitting) {
    const fallback = resolvedSlug ? `/menu/${resolvedSlug}` : "/";
    return <Navigate to={fallback} replace />;
  }

  const applySavedAddress = () => {
    if (!customerFound) return;
    setStreet(customerFound.street || "");
    setNumber(customerFound.number || "");
    setNeighborhood(customerFound.neighborhood || "");
    setComplement(customerFound.complement || "");
    setReference(customerFound.reference || "");
    setServiceType("delivery");
    setShowAddressFoundCard(false);
    toast({
      title: "Endereço aplicado!",
      description: "Agora você pode revisar os dados de entrega.",
    });
  };

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    if (isPreview) {
      toast({ title: "Modo preview", description: "Pedidos estão desativados nesta visualização." });
      return;
    }
    if (!resolvedSlug) {
      toast({
        title: "Erro ao enviar pedido",
        description: "Não conseguimos identificar o cardápio deste link.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const itemsSnapshot = cart.items.map((it) => ({
        product_name: it.product_name,
        quantity: it.quantity,
        product_price: it.product_price,
        note: it.note,
      }));

      const result = await createPublicOrder({
        restaurant_slug: resolvedSlug,
        customer: { name: name.trim(), phone },
        service_type: serviceType,
        payment_method: paymentMethod,
        change_for: paymentMethod === "cash" && changeFor ? Number(changeFor) : null,
        address:
          serviceType === "delivery"
            ? {
                street: street.trim(),
                number: number.trim(),
                neighborhood: neighborhood.trim(),
                complement: complement.trim() || undefined,
                reference: reference.trim() || undefined,
              }
            : null,
        note: note.trim() || undefined,
        items: cart.items,
        client_request_id: requestId,
        loyalty_reward_id: loyaltyRewardId,
      });

      // Lógica de limpeza agressiva do carrinho
      cart.clear();
      try {
        sessionStorage.removeItem(CART_STORAGE_KEY);
        sessionStorage.removeItem(REWARD_KEY);
        localStorage.removeItem(CART_STORAGE_KEY);
        if (phoneDigits) localStorage.setItem(PHONE_KEY, phoneDigits);
      } catch (e) {
        console.warn("Erro ao limpar storage:", e);
      }

      const tokenParam = result.public_token ? `?t=${result.public_token}` : "";
      const projectedEarn = loyaltyQuery.data?.projected_earn ?? 0;
      const balanceBefore = loyaltyQuery.data?.balance ?? 0;
      const balanceAfter = Math.max(
        0,
        balanceBefore - (selectedReward?.points_cost ?? 0),
      ) + projectedEarn;

      nav(`/menu/${resolvedSlug}/sucesso/${result.id}${tokenParam}`, {
        replace: true,
        state: {
          estimated_ready_at: result.estimated_ready_at,
          total: result.total,
          status: result.status,
          customer_name: name.trim(),
          customer_phone: phone,
          service_type: serviceType,
          payment_method: paymentMethod,
          delivery_fee: deliveryFee,
          subtotal,
          note: note.trim(),
          items: itemsSnapshot,
          address:
            serviceType === "delivery"
              ? {
                  street: street.trim(),
                  number: number.trim(),
                  neighborhood: neighborhood.trim(),
                  complement: complement.trim() || undefined,
                  reference: reference.trim() || undefined,
                }
              : null,
          loyalty_points_pending: projectedEarn,
          loyalty_reward_name: selectedReward?.display_name ?? null,
          loyalty_reward_points: selectedReward?.points_cost ?? null,
          loyalty_balance_after: balanceAfter,
        },
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "");
      const code = extractErrorCode(e);
      let friendly = "Não foi possível enviar o pedido. Tente novamente.";
      
      if (msg.includes("restaurant_closed")) friendly = "A loja está fechada no momento.";
      else if (msg.includes("restaurant_not_found")) friendly = "Restaurante não encontrado.";
      else if (msg.includes("neighborhood_not_served")) friendly = "Não entregamos nesse bairro.";
      else if (msg.includes("product_unavailable")) friendly = "Um item ficou indisponível.";
      else if (msg.includes("invalid_phone")) friendly = "Telefone inválido.";
      else if (msg.includes("min_subtotal_not_met")) friendly = "Pedido abaixo do mínimo exigido.";

      logError({
        source: "public_checkout",
        message: msg,
        code,
        context: { resolved_slug: resolvedSlug, service_type: serviceType, total },
      });

      toast({ title: "Erro ao enviar pedido", description: friendly, variant: "destructive" });
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-orange-50/20 pb-40 md:pb-20">
      {isPreview && (
        <div className="bg-warning px-4 py-2 text-center text-xs font-bold text-warning-foreground animate-in slide-in-from-top duration-300">
          Modo preview — pedidos desativados
        </div>
      )}
      
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-orange-100 bg-white/80 px-4 py-4 backdrop-blur-md">
        <button
          onClick={() => nav(resolvedSlug ? `/menu/${resolvedSlug}` : "/")}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-black tracking-tight text-slate-800">Finalizar Pedido</h1>
          <p className="text-[10px] uppercase font-bold text-orange-600 tracking-wider">Passo final</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          
          {/* 1. Telefone e Nome */}
          <section className="bg-white rounded-3xl p-6 shadow-[var(--shadow-soft)] border border-orange-100 space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-primary/10 p-2 rounded-xl text-primary">
                <Phone size={20} />
              </div>
              <h2 className="text-lg font-black text-slate-800">Seu Contato</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="phone" className="text-xs font-bold uppercase text-muted-foreground ml-1 mb-1.5 block">
                  Telefone / WhatsApp
                </Label>
                <div className="relative">
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    inputMode="tel"
                    className="h-14 text-lg font-bold rounded-2xl border-orange-100 focus-visible:ring-primary focus-visible:border-primary transition-all pr-12"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {searchingCustomer ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : phoneOk ? (
                      <UserCheck className="h-5 w-5 text-success animate-in zoom-in" />
                    ) : (
                      <Phone className="h-5 w-5 text-muted-foreground/30" />
                    )}
                  </div>
                </div>
              </div>

              {phoneOk && !searchingCustomer && customerFound && (
                <div className="bg-orange-50/80 border border-orange-200 rounded-2xl p-4 flex items-start gap-4 animate-in fade-in slide-in-from-top-2">
                  <div className="bg-white p-2 rounded-xl shadow-sm">
                    <UserCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800 leading-tight">Cliente cadastrado</p>
                    <p className="text-xs text-slate-600 mt-0.5">Olá, <span className="font-bold text-primary">{customerFound.name}</span>! Que bom ver você de novo.</p>
                  </div>
                </div>
              )}

              <div className="animate-in fade-in slide-in-from-top-2">
                <Label htmlFor="name" className="text-xs font-bold uppercase text-muted-foreground ml-1 mb-1.5 block">
                  Seu Nome
                </Label>
                <div className="relative">
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Como devemos chamar você?"
                    maxLength={80}
                    className="h-14 text-lg rounded-2xl border-orange-100 focus-visible:ring-primary focus-visible:border-primary transition-all pl-12"
                  />
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40" />
                </div>
              </div>
            </div>
          </section>

          {/* 2. Como receber */}
          <section className="bg-white rounded-3xl p-6 shadow-[var(--shadow-soft)] border border-orange-100 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-primary/10 p-2 rounded-xl text-primary">
                <Truck size={20} />
              </div>
              <h2 className="text-lg font-black text-slate-800">Entrega ou Retirada?</h2>
            </div>

            <RadioGroup
              value={serviceType}
              onValueChange={(v) => setServiceType(v as ServiceType)}
              className="grid grid-cols-1 md:grid-cols-3 gap-3"
            >
              {[
                { v: "pickup", t: "Retirada", i: ShoppingBag, d: "Vou buscar no local" },
                { v: "delivery", t: "Entrega", i: Truck, d: "Entregue em minha casa" },
                { v: "dine_in", t: "Balcão", i: User, d: "Estou no restaurante" },
              ].map((o) => {
                const Icon = o.i;
                const isSelected = serviceType === o.v;
                return (
                  <label
                    key={o.v}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all cursor-pointer group",
                      isSelected 
                        ? "border-primary bg-orange-50/50 ring-1 ring-primary/20 shadow-sm" 
                        : "border-orange-50 hover:border-orange-200 bg-orange-50/10"
                    )}
                  >
                    <RadioGroupItem value={o.v} className="sr-only" />
                    <Icon className={cn("h-6 w-6 mb-1", isSelected ? "text-primary" : "text-slate-400 group-hover:text-primary/60")} />
                    <div className="text-center">
                      <p className={cn("text-sm font-black uppercase tracking-tight", isSelected ? "text-primary" : "text-slate-600")}>
                        {o.t}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium leading-none mt-1">{o.d}</p>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>

            {serviceType === "delivery" && (
              <div className="grid grid-cols-6 gap-4 mt-6 p-5 bg-orange-50/30 rounded-2xl border border-orange-100 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="col-span-4">
                  <Label className="text-xs font-bold uppercase text-muted-foreground ml-1 mb-1.5 block">Rua</Label>
                  <Input value={street} onChange={(e) => setStreet(e.target.value)} className="h-12 rounded-xl border-orange-100" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground ml-1 mb-1.5 block">Nº</Label>
                  <Input value={number} onChange={(e) => setNumber(e.target.value)} className="h-12 rounded-xl border-orange-100" />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs font-bold uppercase text-muted-foreground ml-1 mb-1.5 block">Bairro</Label>
                  <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="h-12 rounded-xl border-orange-100" />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs font-bold uppercase text-muted-foreground ml-1 mb-1.5 block">Complemento</Label>
                  <Input value={complement} onChange={(e) => setComplement(e.target.value)} className="h-12 rounded-xl border-orange-100" />
                </div>
              </div>
            )}
          </section>

          {/* 3. Pagamento */}
          <section className="bg-white rounded-3xl p-6 shadow-[var(--shadow-soft)] border border-orange-100 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-primary/10 p-2 rounded-xl text-primary">
                <CreditCard size={20} />
              </div>
              <h2 className="text-lg font-black text-slate-800">Pagamento</h2>
            </div>

            <RadioGroup
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              className="grid grid-cols-1 md:grid-cols-3 gap-3"
            >
              {[
                { v: "pix", t: "PIX", d: "Rápido e seguro" },
                { v: "cash", t: "Dinheiro", d: "Pagamento na entrega" },
                { v: "card", t: "Cartão", d: "Maquininha" },
              ].map((o) => {
                const isSelected = paymentMethod === o.v;
                return (
                  <label
                    key={o.v}
                    className={cn(
                      "flex flex-col items-center gap-1 p-4 rounded-2xl border-2 transition-all cursor-pointer",
                      isSelected ? "border-primary bg-orange-50/50 shadow-sm" : "border-orange-50 bg-orange-50/10 hover:border-orange-200"
                    )}
                  >
                    <RadioGroupItem value={o.v} className="sr-only" />
                    <p className={cn("text-sm font-black uppercase tracking-tight", isSelected ? "text-primary" : "text-slate-600")}>
                      {o.t}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">{o.d}</p>
                  </label>
                );
              })}
            </RadioGroup>

            {paymentMethod === "cash" && (
              <div className="mt-4 p-4 bg-orange-50/30 rounded-2xl animate-in zoom-in-95">
                <Label className="text-xs font-bold text-slate-600 mb-1.5 block">Precisa de troco?</Label>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-bold">R$</span>
                  <Input
                    value={changeFor}
                    onChange={(e) => setChangeFor(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="Ex: 100"
                    inputMode="decimal"
                    className="h-12 rounded-xl border-orange-100"
                  />
                </div>
              </div>
            )}
          </section>

          {/* 4. Fidelidade e Brindes */}
          <LoyaltySection
            phone={phone}
            restaurantSlug={resolvedSlug}
            subtotal={subtotal}
            serviceType={serviceType}
            selectedRewardId={loyaltyRewardId}
            onChange={setLoyaltyRewardId}
          />

          {/* 5. Observação */}
          <section className="bg-white rounded-3xl p-6 shadow-[var(--shadow-soft)] border border-orange-100 space-y-4">
             <div className="flex items-center gap-3 mb-2">
              <div className="bg-primary/10 p-2 rounded-xl text-primary">
                <MessageSquare size={20} />
              </div>
              <h2 className="text-lg font-black text-slate-800">Observações</h2>
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 300))}
              placeholder="Ex: tirar cebola, caprichar no molho..."
              rows={3}
              className="rounded-2xl border-orange-100 focus-visible:ring-primary min-h-[100px]"
            />
          </section>
        </div>

        {/* Resumo do Pedido - Coluna Direita (Desktop) */}
        <aside className="lg:col-span-5 relative">
          <div className="lg:sticky lg:top-24 space-y-6">
            <Card className="rounded-3xl border-orange-200 overflow-hidden shadow-xl">
              <div className="bg-slate-800 p-5 text-white">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-black uppercase tracking-widest">Resumo do Pedido</h3>
                  <div className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase">
                    {cart.itemCount} {cart.itemCount === 1 ? "item" : "itens"}
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-white space-y-4">
                <div className="max-h-[30vh] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {cart.items.map((item, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0 text-xs font-black text-primary">
                        {item.quantity}x
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{item.product_name}</p>
                        {item.note && <p className="text-[10px] text-muted-foreground italic truncate">Obs: {item.note}</p>}
                      </div>
                      <p className="text-sm font-bold text-slate-800 shrink-0">
                        R$ {(item.product_price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-orange-100 space-y-2">
                  <div className="flex justify-between text-sm text-slate-500 font-medium">
                    <span>Subtotal</span>
                    <span className="font-bold">R$ {subtotal.toFixed(2)}</span>
                  </div>
                  
                  {serviceType === "delivery" && (
                    <div className="flex justify-between text-sm text-slate-500 font-medium">
                      <span>Taxa de Entrega</span>
                      <span className="font-bold text-orange-600">R$ {DELIVERY_FEE_FIXED.toFixed(2)}</span>
                    </div>
                  )}

                  {selectedReward && (
                    <div className="flex justify-between text-sm text-primary font-bold bg-primary/5 px-3 py-2 rounded-xl border border-primary/20 animate-in zoom-in-95">
                      <span className="flex items-center gap-1.5"><Gift size={14} /> Brinde: {selectedReward.display_name}</span>
                      <span>Grátis</span>
                    </div>
                  )}

                  <div className="pt-4 mt-2 border-t-2 border-orange-100 flex justify-between items-baseline">
                    <span className="text-lg font-black text-slate-800 uppercase tracking-tighter">Total</span>
                    <span className="text-3xl font-black text-primary">R$ {total.toFixed(2)}</span>
                  </div>
                </div>
                
                <div className="hidden lg:block pt-2">
                  <Button
                    size="lg"
                    className="w-full h-16 rounded-2xl text-lg font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                    disabled={!canSubmit || submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        ENVIANDO...
                      </div>
                    ) : (
                      "CONFIRMAR PEDIDO"
                    )}
                  </Button>
                  <p className="text-center text-[10px] text-muted-foreground mt-3 uppercase font-bold tracking-widest opacity-60">
                    Ao confirmar, você aceita nossos termos
                  </p>
                </div>
              </div>
            </Card>

            <div className="bg-white/60 rounded-2xl p-4 border border-orange-100/50 flex items-start gap-3">
              <div className="bg-orange-100 p-1.5 rounded-lg text-orange-600">
                <Info size={16} />
              </div>
              <p className="text-[10px] text-orange-800/70 font-bold uppercase leading-relaxed tracking-wider">
                Verifique se o seu número de WhatsApp está correto para receber as atualizações do pedido.
              </p>
            </div>
          </div>
        </aside>
      </main>

      {/* Botão Fixo Mobile */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-orange-100 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] animate-in slide-in-from-bottom duration-500">
        <div className="max-w-xl mx-auto space-y-3">
          <div className="flex justify-between items-baseline px-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total do Pedido</span>
            <span className="text-2xl font-black text-primary">R$ {total.toFixed(2)}</span>
          </div>
          <Button
            size="lg"
            className="w-full h-16 rounded-2xl text-lg font-black shadow-lg shadow-primary/20"
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                ENVIANDO...
              </div>
            ) : (
              "CONFIRMAR PEDIDO"
            )}
          </Button>
        </div>
        <div className="h-safe" />
      </div>
    </div>
  );
}
