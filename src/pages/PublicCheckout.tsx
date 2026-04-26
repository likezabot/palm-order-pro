import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams, Navigate, Link } from "react-router-dom";
import { ArrowLeft, Gift } from "lucide-react";
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
  DELIVERY_FEE_FIXED,
  type ServiceType,
  type PaymentMethod,
} from "@/lib/public-cart";
import { fetchRestaurantBySlug } from "@/lib/public-menu";
import { fetchLoyaltyStatus, normalizePhoneClient } from "@/lib/loyalty";
import { logError, extractErrorCode } from "@/lib/error-log";
import LoyaltySection from "@/components/public-menu/LoyaltySection";

const PHONE_KEY = "pb_loyalty_phone";
const REWARD_KEY = "pb_pending_reward";

export default function PublicCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const { toast } = useToast();
  const cart = usePublicCart();
  const isPreview = usePreviewMode();

  const restaurantQuery = useQuery({
    queryKey: ["pmenu", "restaurant", slug],
    queryFn: () => fetchRestaurantBySlug(slug ?? ""),
    enabled: !!slug,
    staleTime: 60_000,
  });

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

  // client_request_id estável durante a sessão de checkout
  const [requestId] = useState(() => newClientRequestId());

  const subtotal = cart.subtotal;
  const deliveryFee = computeDeliveryFee(serviceType);
  const total = subtotal + deliveryFee;

  // Status de fidelidade — usado para resumo, botão e tela de sucesso
  const phoneDigits = normalizePhoneClient(phone);
  const phoneOk = phoneDigits.length >= 10;
  const loyaltyQuery = useQuery({
    queryKey: ["loyalty-status", slug, phoneDigits, subtotal, serviceType],
    queryFn: () =>
      fetchLoyaltyStatus({
        phone: phoneDigits,
        restaurantSlug: slug ?? "",
        orderSubtotal: subtotal,
        serviceType,
      }),
    enabled: phoneOk && !!slug,
    staleTime: 10_000,
  });

  // Aplica brinde pendente quando rewards carregam (apenas pickup)
  useEffect(() => {
    if (!pendingRewardId || !loyaltyQuery.data?.enabled) return;
    if (serviceType !== "pickup") {
      // Em delivery/dine_in, descarta brinde pendente
      try { sessionStorage.removeItem(REWARD_KEY); } catch { /* ignore */ }
      setPendingRewardId(null);
      return;
    }
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
    const fallback = slug ? `/menu/${slug}` : "/";
    return <Navigate to={fallback} replace />;
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    if (isPreview) {
      toast({ title: "Modo preview", description: "Pedidos estão desativados nesta visualização." });
      return;
    }
    setSubmitting(true);
    try {
      const result = await createPublicOrder({
        restaurant_slug: slug ?? "",
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

      cart.clear();
      // Limpa brinde pendente — só após o pedido ter sido criado com sucesso
      try {
        sessionStorage.removeItem(REWARD_KEY);
        // Salva telefone para próximas visitas
        if (phoneDigits) localStorage.setItem(PHONE_KEY, phoneDigits);
      } catch {
        /* ignore */
      }
      const tokenParam = result.public_token ? `?t=${result.public_token}` : "";
      const projectedEarn = loyaltyQuery.data?.projected_earn ?? 0;
      const balanceBefore = loyaltyQuery.data?.balance ?? 0;
      const balanceAfter = Math.max(
        0,
        balanceBefore - (selectedReward?.points_cost ?? 0),
      ) + projectedEarn;
      nav(`/menu/${slug}/sucesso/${result.id}${tokenParam}`, {
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
          items: cart.items.map((it) => ({
            product_name: it.product_name,
            quantity: it.quantity,
            product_price: it.product_price,
            note: it.note,
          })),
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
          loyalty_balance_after: balanceAfter,
        },
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "");
      const code = extractErrorCode(e);
      let friendly = "Não foi possível enviar o pedido. Tente novamente.";
      if (msg.includes("restaurant_closed")) friendly = "A loja está fechada no momento.";
      else if (msg.includes("neighborhood_not_served")) friendly = "Não entregamos nesse bairro.";
      else if (msg.includes("product_unavailable")) friendly = "Um item do carrinho ficou indisponível. Revise o pedido.";
      else if (msg.includes("invalid_phone")) friendly = "Telefone inválido.";
      else if (msg.includes("invalid_name")) friendly = "Informe seu nome.";
      else if (msg.includes("invalid_address")) friendly = "Endereço é obrigatório para entrega.";
      else if (msg.includes("empty_cart")) friendly = "Carrinho vazio.";
      else if (msg.includes("invalid_quantity")) friendly = "Quantidade inválida em algum item.";
      else if (msg.includes("insufficient_points")) friendly = "Você não tem pontos suficientes para esse brinde.";
      else if (msg.includes("reward_inactive")) friendly = "Esse brinde não está mais disponível.";
      else if (msg.includes("reward_pickup_only")) friendly = "Resgate de brindes disponível apenas para retirada.";
      else if (msg.includes("reward_below_min_points")) friendly = "Esse brinde precisa de no mínimo 100 pontos.";
      else if (msg.includes("min_subtotal_not_met")) friendly = "Pedido abaixo do mínimo exigido para esse brinde.";
      else if (msg.includes("loyalty_disabled")) friendly = "Programa de fidelidade indisponível no momento.";
      else if (msg.includes("not unique") || msg.includes("PGRST203")) friendly = "Erro temporário do servidor. Tente novamente.";

      void logError({
        source: "public_checkout",
        message: msg || "erro desconhecido no checkout",
        code,
        context: {
          slug,
          service_type: serviceType,
          payment_method: paymentMethod,
          item_count: cart.itemCount,
          total,
          error_details: e?.details ?? null,
          error_hint: e?.hint ?? null,
          error_status: e?.status ?? null,
        },
      });

      toast({ title: "Erro ao enviar pedido", description: friendly, variant: "destructive" });
      setSubmitting(false);
    }
  }

  return (
    <div className="public-menu-theme min-h-screen bg-background pb-32">
      {isPreview && (
        <div className="bg-warning px-4 py-2 text-center text-xs font-bold text-warning-foreground">
          Modo preview — pedidos desativados
        </div>
      )}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => nav(`/menu/${slug}`)}
          aria-label="Voltar"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-bold">Finalizar pedido</h1>
      </header>

      <main className="mx-auto max-w-xl px-4 py-5 space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase text-muted-foreground">Seus dados</h2>
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="phone">Telefone (WhatsApp)</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(11) 99999-9999"
              inputMode="tel"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase text-muted-foreground">Como receber</h2>
          <RadioGroup
            value={serviceType}
            onValueChange={(v) => setServiceType(v as ServiceType)}
            className="grid grid-cols-1 gap-2"
          >
            {[
              { v: "pickup", t: "Retirar no local" },
              { v: "delivery", t: "Entrega" },
              { v: "dine_in", t: "Vou no balcão" },
            ].map((o) => (
              <label
                key={o.v}
                className="flex items-center gap-3 rounded-xl border border-border p-4 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <RadioGroupItem value={o.v} />
                <span className="font-medium">{o.t}</span>
              </label>
            ))}
          </RadioGroup>
        </section>

        {serviceType === "delivery" && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase text-muted-foreground">Endereço de entrega</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Rua</Label>
                <Input value={street} onChange={(e) => setStreet(e.target.value)} maxLength={120} />
              </div>
              <div>
                <Label>Número</Label>
                <Input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={20} />
              </div>
            </div>
            <div>
              <Label>Bairro</Label>
              <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} maxLength={80} />
            </div>
            <div>
              <Label>Complemento (opcional)</Label>
              <Input value={complement} onChange={(e) => setComplement(e.target.value)} maxLength={80} />
            </div>
            <div>
              <Label>Ponto de referência (opcional)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase text-muted-foreground">Pagamento</h2>
          <RadioGroup
            value={paymentMethod}
            onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
            className="grid grid-cols-1 gap-2"
          >
            {[
              { v: "pix", t: "PIX" },
              { v: "cash", t: "Dinheiro" },
              { v: "card", t: "Cartão (na entrega/retirada)" },
            ].map((o) => (
              <label
                key={o.v}
                className="flex items-center gap-3 rounded-xl border border-border p-4 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <RadioGroupItem value={o.v} />
                <span className="font-medium">{o.t}</span>
              </label>
            ))}
          </RadioGroup>
          {paymentMethod === "cash" && (
            <div>
              <Label>Troco para quanto? (opcional)</Label>
              <Input
                value={changeFor}
                onChange={(e) => setChangeFor(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="Ex: 100"
                inputMode="decimal"
              />
            </div>
          )}
        </section>

        <LoyaltySection
          phone={phone}
          restaurantSlug={slug ?? ""}
          subtotal={subtotal}
          serviceType={serviceType}
          selectedRewardId={loyaltyRewardId}
          onChange={setLoyaltyRewardId}
        />

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase text-muted-foreground">Observação</h2>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder="Algo que precisamos saber?"
            rows={3}
          />
        </section>

        <section className="rounded-xl border border-border bg-card p-4 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "itens"})</span>
            <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Taxa de entrega {serviceType !== "delivery" && "(não se aplica)"}
            </span>
            <span className={serviceType === "delivery" ? "font-medium" : "text-muted-foreground"}>
              {serviceType === "delivery" ? `R$ ${DELIVERY_FEE_FIXED.toFixed(2)}` : "R$ 0,00"}
            </span>
          </div>
          {selectedReward && (
            <div className="flex justify-between text-sm pt-1 border-t border-dashed border-border/60">
              <span className="flex items-center gap-1.5 text-primary font-semibold">
                <Gift size={13} />
                Brinde: {selectedReward.display_name}
              </span>
              <span className="font-medium text-primary">R$ 0,00</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-lg font-bold">
            <span>Total</span>
            <span className="brand-gradient-text">R$ {total.toFixed(2)}</span>
          </div>
        </section>
      </main>

      <div
        className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 p-4 backdrop-blur"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <Button
          size="lg"
          className="w-full h-14 text-base font-bold"
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
        >
          {submitting
            ? "Enviando..."
            : selectedReward
              ? `Confirmar pedido com brinde • R$ ${total.toFixed(2)}`
              : `Confirmar pedido • R$ ${total.toFixed(2)}`}
        </Button>
      </div>
    </div>
  );
}
