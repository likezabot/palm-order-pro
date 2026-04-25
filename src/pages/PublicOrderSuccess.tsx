import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation, useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, Clock, ChefHat, Package, CreditCard, XCircle, AlertCircle, MessageCircle, type LucideIcon } from "lucide-react";

const STORE_WHATSAPP = "5567992785811";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type LocState = {
  estimated_ready_at?: string | null;
  total?: number;
  status?: string;
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

function buildSteps(info: StatusInfo | null): { steps: Step[]; activeIndex: number; cancelled: boolean } {
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

export default function PublicOrderSuccess() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const loc = useLocation();
  const [params] = useSearchParams();
  const token = params.get("t");
  const state = (loc.state ?? {}) as LocState;

  const [info, setInfo] = useState<StatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Fetch inicial + polling de fallback (8s)
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

  // Realtime: ao mudar o pedido, refetch (a RPC valida token)
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
  const status = info?.status ?? state.status ?? "new";
  const shortId = (orderId ?? "").slice(0, 8).toUpperCase();
  const { steps, activeIndex, cancelled } = buildSteps(info);

  const serviceLabel: Record<string, string> = {
    delivery: "Entrega",
    pickup: "Retirada no balcão",
    dine_in: "Consumir no local",
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-5 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${cancelled ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"} animate-scale-in`}>
            {cancelled ? <XCircle size={48} /> : <CheckCircle2 size={48} />}
          </div>
          <div>
            <h1 className="text-2xl font-black">
              {cancelled ? "Pedido cancelado" : "Pedido enviado!"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {cancelled
                ? info?.rejected_reason || "Seu pedido foi cancelado."
                : "Acompanhe o status do seu pedido em tempo real."}
            </p>
          </div>
        </div>

        {/* Resumo */}
        <div className="rounded-2xl border border-border p-5 text-left space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Identificador</span>
            <span className="font-mono font-bold">#{shortId}</span>
          </div>
          {info?.service_type && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Tipo</span>
              <span className="font-semibold">{serviceLabel[info.service_type] ?? info.service_type}</span>
            </div>
          )}
          {Number(total) > 0 && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-black brand-gradient-text">
                R$ {Number(total).toFixed(2)}
              </span>
            </div>
          )}
          {eta && !cancelled && status !== "paid" && (
            <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-primary">
              <Clock size={16} />
              <span className="text-sm font-semibold">
                Previsão: {new Date(eta).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>

        {/* Timeline */}
        {!cancelled && (
          <div className="rounded-2xl border border-border p-5">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-4">
              Status do pedido
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
                      <div className={`font-semibold ${reached ? "text-foreground" : "text-muted-foreground"}`}>
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

        <div className="space-y-2">
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
