import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation, useSearchParams, Link } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  ChefHat,
  Package,
  CreditCard,
  XCircle,
  AlertCircle,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { fetchRestaurantBySlug } from "@/lib/public-menu";

type LocItem = {
  product_name: string;
  quantity: number;
  product_price: number;
  note?: string;
};

type LocAddress = {
  street?: string;
  number?: string;
  neighborhood?: string;
  complement?: string;
  reference?: string;
};

type LocState = {
  estimated_ready_at?: string | null;
  total?: number;
  status?: string;
  customer_name?: string;
  customer_phone?: string;
  service_type?: string;
  payment_method?: string;
  delivery_fee?: number;
  subtotal?: number;
  note?: string;
  items?: LocItem[];
  address?: LocAddress | null;
};

type StatusInfo = {
  id: string;
  status: string;
  service_type?: string;
  customer_name?: string | null;
  total: number | null;
  delivery_fee?: number | null;
  estimated_ready_at: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  served_at?: string | null;
  updated_at?: string | null;
  payment_method?: string | null;
  rejected_reason?: string | null;
  short_code?: string;
};

type Step = {
  key: string;
  label: string;
  icon: LucideIcon;
  reachedAt?: string | null;
};

const SERVICE_LABEL: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Retirada no balcão",
  dine_in: "Consumir no local",
};

const SERVICE_EMOJI: Record<string, string> = {
  delivery: "🚚 ENTREGA",
  pickup: "🏃 RETIRADA",
  dine_in: "🍽️ NO LOCAL",
};

const PAYMENT_LABEL: Record<string, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  card: "Cartão",
};

function buildSteps(info: StatusInfo | null): {
  steps: Step[];
  activeIndex: number;
  cancelled: boolean;
} {
  const status = info?.status ?? "new";
  const cancelled = status === "cancelled";
  const steps: Step[] = [
    { key: "new", label: "Pedido recebido", icon: CheckCircle2, reachedAt: info?.created_at ?? null },
    { key: "preparing", label: "Em preparo", icon: ChefHat, reachedAt: info?.approved_at ?? null },
    { key: "done", label: "Pronto", icon: Package, reachedAt: info?.served_at ?? null },
    { key: "paid", label: "Finalizado", icon: CreditCard, reachedAt: status === "paid" ? info?.updated_at ?? null : null },
  ];
  const order = ["new", "preparing", "done", "paid"];
  const activeIndex = cancelled ? -1 : Math.max(0, order.indexOf(status));
  return { steps, activeIndex, cancelled };
}

function formatWhatsAppMessage(opts: {
  shortId: string;
  restaurantName: string;
  customerName?: string;
  customerPhone?: string;
  serviceType?: string;
  items?: LocItem[];
  note?: string;
  paymentMethod?: string;
  deliveryFee?: number;
  total: number;
  address?: LocAddress | null;
}): string {
  const lines: string[] = [];
  lines.push(`🔥 *NOVO PEDIDO - ${opts.restaurantName.toUpperCase()}*`);
  lines.push("");
  lines.push(`🧾 *Pedido:* #${opts.shortId}`);
  if (opts.customerName) lines.push(`👤 *Cliente:* ${opts.customerName}`);
  if (opts.customerPhone) lines.push(`📞 *Telefone:* ${opts.customerPhone}`);
  const svc = opts.serviceType
    ? SERVICE_EMOJI[opts.serviceType] ?? opts.serviceType
    : "—";
  lines.push(`📍 *Tipo:* ${svc}`);

  if (opts.serviceType === "delivery" && opts.address) {
    const a = opts.address;
    const addrLine = [
      a.street,
      a.number ? `, ${a.number}` : "",
      a.neighborhood ? ` — ${a.neighborhood}` : "",
    ]
      .filter(Boolean)
      .join("");
    if (addrLine) lines.push(`🏠 *Endereço:* ${addrLine}`);
    if (a.complement) lines.push(`   _Compl.:_ ${a.complement}`);
    if (a.reference) lines.push(`   _Ref.:_ ${a.reference}`);
  }

  lines.push("");
  lines.push("🍢 *Itens:*");
  if (opts.items && opts.items.length) {
    for (const it of opts.items) {
      const lineTotal = (it.product_price * it.quantity).toFixed(2);
      lines.push(`• ${it.quantity}x ${it.product_name} — R$ ${lineTotal}`);
      if (it.note) lines.push(`   _obs:_ ${it.note}`);
    }
  } else {
    lines.push("• (itens não disponíveis)");
  }

  lines.push("");
  lines.push("📝 *Observações:*");
  lines.push(opts.note && opts.note.trim() ? opts.note.trim() : "Sem observações");

  lines.push("");
  if (opts.paymentMethod) {
    lines.push(`💵 *Pagamento:* ${PAYMENT_LABEL[opts.paymentMethod] ?? opts.paymentMethod}`);
  }
  const fee = opts.deliveryFee ?? 0;
  if (opts.serviceType === "delivery") {
    lines.push(`🚚 *Taxa de entrega:* R$ ${fee.toFixed(2)}`);
  }
  lines.push(`💰 *Total:* R$ ${opts.total.toFixed(2)}`);
  lines.push("");
  lines.push("⏰ _Pedido feito pelo cardápio online._");
  return lines.join("\n");
}

export default function PublicOrderSuccess() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const loc = useLocation();
  const [params] = useSearchParams();
  const token = params.get("t");
  const state = (loc.state ?? {}) as LocState;

  const [info, setInfo] = useState<StatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restaurantQuery = useQuery({
    queryKey: ["pmenu", "restaurant", slug],
    queryFn: () => fetchRestaurantBySlug(slug ?? ""),
    enabled: !!slug,
    staleTime: 60_000,
  });

  const fetchStatus = useCallback(async () => {
    if (!orderId || !token) return;
    const { data, error } = await supabase.rpc("get_public_order_status" as any, {
      p_order_id: orderId,
      p_token: token,
    });
    if (error) {
      setError("Não foi possível carregar o pedido.");
      return;
    }
    setError(null);
    if (data) setInfo(data as unknown as StatusInfo);
  }, [orderId, token]);

  useEffect(() => {
    let mounted = true;
    fetchStatus();
    const id = window.setInterval(() => {
      if (mounted) fetchStatus();
    }, 8000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [fetchStatus]);

  useEffect(() => {
    if (!orderId) return;
    const ch = supabase
      .channel(`order-status-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => fetchStatus(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId, fetchStatus]);

  const eta = info?.estimated_ready_at ?? state.estimated_ready_at ?? null;
  const total = info?.total ?? state.total ?? 0;
  const deliveryFee = info?.delivery_fee ?? state.delivery_fee ?? 0;
  const subtotal = state.subtotal ?? Math.max(0, Number(total) - Number(deliveryFee));
  const status = info?.status ?? state.status ?? "new";
  const serviceType = info?.service_type ?? state.service_type ?? "";
  const shortId = (orderId ?? "").slice(0, 8).toUpperCase();
  const { steps, activeIndex, cancelled } = buildSteps(info);

  const restaurant = restaurantQuery.data;
  const restaurantName = restaurant?.name ?? "Plano B Espetaria";
  // remove caracteres não numéricos do whatsapp
  const restaurantWa = (restaurant?.whatsapp_phone ?? "").replace(/\D/g, "");

  const waMessage = formatWhatsAppMessage({
    shortId,
    restaurantName,
    customerName: state.customer_name ?? info?.customer_name ?? undefined,
    customerPhone: state.customer_phone,
    serviceType,
    items: state.items,
    note: state.note,
    paymentMethod: state.payment_method ?? info?.payment_method ?? undefined,
    deliveryFee: Number(deliveryFee),
    total: Number(total),
    address: state.address,
  });

  const waUrl = restaurantWa
    ? `https://wa.me/${restaurantWa}?text=${encodeURIComponent(waMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  if (!orderId || !token) {
    return <Navigate to={slug ? `/menu/${slug}` : "/"} replace />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-6 sm:py-8">
      <div className="w-full max-w-md space-y-5">
        {/* Header de sucesso */}
        <div className="text-center space-y-3">
          <div
            className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full ${
              cancelled
                ? "bg-destructive/15 text-destructive"
                : "bg-success/15 text-success"
            } animate-scale-in`}
          >
            {cancelled ? <XCircle size={56} /> : <CheckCircle2 size={56} />}
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              {cancelled ? "Pedido cancelado" : "Pedido confirmado!"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1.5 px-2">
              {cancelled
                ? info?.rejected_reason || "Seu pedido foi cancelado."
                : "Recebemos seu pedido e já estamos preparando."}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-primary">
            <span className="text-xs uppercase tracking-wide font-bold">Pedido</span>
            <span className="font-mono font-black text-lg">#{shortId}</span>
          </div>
        </div>

        {/* WhatsApp CTA — mais alto, mais chamativo */}
        {!cancelled && (
          <div className="rounded-2xl border-2 border-[#25D366]/30 bg-[#25D366]/5 p-4 space-y-3 shadow-md">
            <div className="text-center space-y-1">
              <p className="text-base font-bold text-foreground">
                ✅ Pedido recebido!
              </p>
              <p className="text-xs text-muted-foreground">
                Toque abaixo para enviar a confirmação para o restaurante.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold h-14 text-base shadow-sm"
            >
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2" size={22} />
                Avisar pelo WhatsApp
              </a>
            </Button>
          </div>
        )}

        {/* Resumo do pedido */}
        <div className="rounded-2xl border border-border bg-card p-5 text-left space-y-3 shadow-sm">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
            Resumo
          </h2>
          {serviceType && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tipo</span>
              <span className="font-semibold">
                {SERVICE_LABEL[serviceType] ?? serviceType}
              </span>
            </div>
          )}
          {state.items && state.items.length > 0 && (
            <div className="border-t border-border pt-3 space-y-1.5">
              {state.items.map((it, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="flex-1 pr-2">
                    <span className="font-semibold tabular-nums">{it.quantity}x</span>{" "}
                    {it.product_name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    R$ {(it.product_price * it.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-border pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">R$ {Number(subtotal).toFixed(2)}</span>
            </div>
            {Number(deliveryFee) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa de entrega</span>
                <span className="tabular-nums">R$ {Number(deliveryFee).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-black border-t border-border pt-2 mt-1">
              <span>Total</span>
              <span className="brand-gradient-text">
                R$ {Number(total).toFixed(2)}
              </span>
            </div>
          </div>
          {eta && !cancelled && status !== "paid" && (
            <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-primary">
              <Clock size={16} />
              <span className="text-sm font-semibold">
                Previsão:{" "}
                {new Date(eta).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>

        {/* Timeline */}
        {!cancelled && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-4">
              Status
            </h2>
            <ol className="space-y-4">
              {steps.map((step, idx) => {
                const Icon = step.icon;
                const reached = idx <= activeIndex;
                const isCurrent = idx === activeIndex;
                return (
                  <li key={step.key} className="flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        reached
                          ? "bg-success text-success-foreground border-success"
                          : "bg-muted text-muted-foreground border-border"
                      } ${isCurrent ? "ring-4 ring-success/20 animate-pulse" : ""}`}
                      aria-current={isCurrent ? "step" : undefined}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 pt-1">
                      <div
                        className={`font-semibold ${
                          reached ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {step.label}
                      </div>
                      {step.reachedAt && reached && (
                        <div className="text-xs text-muted-foreground">
                          {new Date(step.reachedAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 text-destructive p-3 text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2 pt-2">
          <Button asChild variant="outline" className="w-full">
            <Link to={`/menu/${slug}`}>Voltar ao cardápio</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to={`/menu/${slug}/pedidos`}>Ver meus pedidos</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
