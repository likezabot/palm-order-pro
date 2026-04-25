import { useEffect, useState } from "react";
import { useParams, useLocation, useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type LocState = {
  estimated_ready_at?: string | null;
  total?: number;
  status?: string;
};

type StatusInfo = {
  status: string;
  total: number | null;
  estimated_ready_at: string | null;
  table_name?: string;
};

export default function PublicOrderSuccess() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const loc = useLocation();
  const [params] = useSearchParams();
  const token = params.get("t");
  const state = (loc.state ?? {}) as LocState;

  const [info, setInfo] = useState<StatusInfo | null>(null);

  useEffect(() => {
    if (!orderId || !token) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase.rpc("get_public_order_status" as any, {
        p_order_id: orderId,
        p_token: token,
      });
      if (mounted && data) setInfo(data as unknown as StatusInfo);
    })();
    return () => {
      mounted = false;
    };
  }, [orderId, token]);

  const eta = info?.estimated_ready_at ?? state.estimated_ready_at ?? null;
  const total = info?.total ?? state.total ?? 0;
  const status = info?.status ?? state.status ?? "new";
  const shortId = (orderId ?? "").slice(0, 8).toUpperCase();

  const statusLabel: Record<string, string> = {
    new: "Pedido recebido",
    preparing: "Em preparo",
    done: "Pronto",
    paid: "Pago",
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success animate-scale-in">
          <CheckCircle2 size={48} />
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-black">Pedido enviado!</h1>
          <p className="text-muted-foreground">
            Recebemos seu pedido e já estamos preparando.
          </p>
        </div>

        <div className="rounded-2xl border border-border p-5 text-left space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Identificador</span>
            <span className="font-mono font-bold">#{shortId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <span className="font-semibold">{statusLabel[status] ?? status}</span>
          </div>
          {Number(total) > 0 && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-black brand-gradient-text">
                R$ {Number(total).toFixed(2)}
              </span>
            </div>
          )}
          {eta && (
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

        <Button asChild variant="outline" className="w-full">
          <Link to={`/menu/${slug}`}>Voltar ao cardápio</Link>
        </Button>
      </div>
    </div>
  );
}
