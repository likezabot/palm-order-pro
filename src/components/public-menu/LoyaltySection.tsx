/**
 * Seção de fidelidade no checkout público.
 * - Aparece apenas se loyalty_enabled e telefone válido.
 * - Faz debounce manual de 400ms na busca de saldo.
 * - Falha silenciosa: se RPC der erro, NÃO bloqueia o checkout.
 */
import { useEffect, useState } from "react";
import { Gift, Loader2, Check, ExternalLink } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  fetchLoyaltyStatus,
  type LoyaltyStatus,
} from "@/lib/loyalty";

type Props = {
  phone: string;
  restaurantSlug: string;
  subtotal: number;
  selectedRewardId: string | null;
  onChange: (rewardId: string | null) => void;
};

const EMPTY: LoyaltyStatus = {
  enabled: false,
  balance: 0,
  rewards: [],
  points_per_real: 1,
  projected_earn: 0,
};

export default function LoyaltySection({
  phone,
  restaurantSlug,
  subtotal,
  selectedRewardId,
  onChange,
}: Props) {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<LoyaltyStatus>(EMPTY);
  const [loading, setLoading] = useState(false);

  const phoneDigits = phone.replace(/\D/g, "");
  const phoneOk = phoneDigits.length >= 10;

  useEffect(() => {
    if (!phoneOk || !restaurantSlug) {
      setStatus(EMPTY);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(async () => {
      const s = await fetchLoyaltyStatus({
        phone: phoneDigits,
        restaurantSlug,
        orderSubtotal: subtotal,
      });
      if (!cancelled) {
        setStatus(s);
        setLoading(false);
        // Se brinde escolhido ficou indisponível, limpa
        if (selectedRewardId) {
          const r = s.rewards.find((x) => x.id === selectedRewardId);
          if (!r || !r.available) onChange(null);
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneDigits, restaurantSlug, subtotal]);

  if (!phoneOk) return null;
  if (!status.enabled && !loading) return null;

  const selectedReward = selectedRewardId
    ? status.rewards.find((r) => r.id === selectedRewardId) ?? null
    : null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
        <Gift size={16} className="text-primary" />
        Resgatar brindes
      </h2>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-[var(--shadow-soft)]">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Buscando seu saldo…
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5 space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-1">
                <span className="text-sm">
                  Você tem <strong className="text-primary text-base">{status.balance}</strong> pontos
                </span>
              </div>
              {status.projected_earn > 0 && (
                <p className="text-xs text-muted-foreground">
                  Você vai ganhar <strong className="text-success">+{status.projected_earn}</strong>{" "}
                  pontos quando este pedido for finalizado
                </p>
              )}
              <p className="text-[11px] text-muted-foreground pt-1">
                Saldo vinculado ao WhatsApp:{" "}
                <strong className="font-mono text-foreground">{phoneDigits}</strong>
              </p>
            </div>

            {selectedReward && (
              <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                <Check size={14} className="mt-0.5 text-primary shrink-0" />
                <span>
                  <strong className="text-primary">Brinde aplicado:</strong>{" "}
                  {selectedReward.display_name} — R$ 0,00 no pedido
                </span>
              </div>
            )}

            {status.rewards.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-muted-foreground">
                  Escolha 1 brinde
                </p>
                <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input
                    type="radio"
                    name="loyalty-reward"
                    checked={selectedRewardId === null}
                    onChange={() => onChange(null)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm font-medium">Não quero resgatar agora</span>
                </label>
                {status.rewards.map((r) => {
                  const disabled = !r.available;
                  let badge: { label: string; cls: string } | null = null;
                  if (r.available) {
                    badge = {
                      label: "Disponível",
                      cls: "bg-success/15 text-success border-success/30",
                    };
                  } else if (r.blocked_reason?.startsWith("missing_points:")) {
                    const n = r.blocked_reason.split(":")[1];
                    badge = {
                      label: `Faltam ${n} pontos`,
                      cls: "bg-muted text-muted-foreground border-border",
                    };
                  } else if (r.blocked_reason?.startsWith("min_subtotal:")) {
                    const v = Number(r.blocked_reason.split(":")[1] || 0);
                    badge = {
                      label: `Pedido mínimo R$ ${v.toFixed(2)}`,
                      cls: "bg-accent/15 text-accent border-accent/30",
                    };
                  }
                  return (
                    <label
                      key={r.id}
                      className={`flex items-start gap-3 rounded-lg border border-border p-3 ${
                        disabled
                          ? "opacity-60 cursor-not-allowed"
                          : "cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                      }`}
                    >
                      <input
                        type="radio"
                        name="loyalty-reward"
                        disabled={disabled}
                        checked={selectedRewardId === r.id}
                        onChange={() => onChange(r.id)}
                        className="h-4 w-4 mt-0.5 accent-primary"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold truncate">
                            {r.display_name}
                          </span>
                          <span className="text-xs font-bold text-primary whitespace-nowrap">
                            {r.points_cost} pts
                          </span>
                        </div>
                        {badge && (
                          <span
                            className={`inline-block text-[10px] font-bold uppercase tracking-wide rounded-full border px-2 py-0.5 ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum brinde disponível agora. Continue acumulando!
              </p>
            )}

            {slug && (
              <Link
                to={`/menu/${slug}/pontos`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Ver todos os brindes
                <ExternalLink size={11} />
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  );
}
