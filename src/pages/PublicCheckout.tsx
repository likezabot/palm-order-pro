import { useState, useMemo } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
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
  const [submitting, setSubmitting] = useState(false);

  // client_request_id estável durante a sessão de checkout
  const [requestId] = useState(() => newClientRequestId());

  const total = cart.subtotal;
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
    return <Navigate to={`/menu/${slug}`} replace />;
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
      });

      cart.clear();
      const tokenParam = result.public_token ? `?t=${result.public_token}` : "";
      nav(`/menu/${slug}/sucesso/${result.id}${tokenParam}`, {
        replace: true,
        state: {
          estimated_ready_at: result.estimated_ready_at,
          total: result.total,
          status: result.status,
        },
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "");
      let friendly = "Não foi possível enviar o pedido. Tente novamente.";
      if (msg.includes("restaurant_closed")) friendly = "A loja está fechada no momento.";
      else if (msg.includes("neighborhood_not_served")) friendly = "Não entregamos nesse bairro.";
      else if (msg.includes("product_unavailable")) friendly = "Um item do carrinho ficou indisponível. Revise o pedido.";
      else if (msg.includes("invalid_phone")) friendly = "Telefone inválido.";
      else if (msg.includes("invalid_name")) friendly = "Informe seu nome.";
      else if (msg.includes("invalid_address")) friendly = "Endereço é obrigatório para entrega.";
      else if (msg.includes("empty_cart")) friendly = "Carrinho vazio.";
      else if (msg.includes("invalid_quantity")) friendly = "Quantidade inválida em algum item.";
      toast({ title: "Erro ao enviar pedido", description: friendly, variant: "destructive" });
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-32">
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

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase text-muted-foreground">Observação</h2>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder="Algo que precisamos saber?"
            rows={3}
          />
        </section>

        <section className="rounded-xl border border-border p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Itens</span>
            <span>{cart.itemCount}</span>
          </div>
          <div className="mt-1 flex justify-between text-lg font-bold">
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
          {submitting ? "Enviando..." : `Confirmar pedido • R$ ${total.toFixed(2)}`}
        </Button>
      </div>
    </div>
  );
}
