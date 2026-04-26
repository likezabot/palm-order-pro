/**
 * Seção de fidelidade no checkout público.
 * - Aparece apenas se loyalty_enabled e telefone válido.
 * - Faz debounce manual de 400ms na busca de saldo.
 * - Falha silenciosa: se RPC der erro, NÃO bloqueia o checkout.
 */
import { useEffect, useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import {
  fetchLoyaltyStatus,
  blockedReasonText,
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

  const balanceAfter = Math.max(
    0,
    status.balance -
      (selectedRewardId
        ? status.rewards.find((r) => r.id === selectedRewardId)?.points_cost ?? 0
        : 0),
  ) + status.projected_earn;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
        <Gift size={16} className="text-primary" />
        Fidelidade
      </h2>
      <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Buscando seu saldo…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                Você tem <strong className="text-primary">{status.balance}</strong> pontos
              </span>
              {status.projected_earn > 0 && (
                <span className="text-muted-foreground">
                  +{status.projected_earn} neste pedido
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Saldo vinculado ao WhatsApp:{" "}
              <strong className="font-mono">{phoneDigits}</strong>
            </p>

            {status.rewards.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-muted-foreground">
                  Resgatar brinde (1 por pedido)
                </p>
                <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input
                    type="radio"
                    name="loyalty-reward"
                    checked={selectedRewardId === null}
                    onChange={() => onChange(null)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Nenhum brinde</span>
                </label>
                {status.rewards.map((r) => {
                  const blocked = blockedReasonText(r.blocked_reason);
                  const disabled = !r.available;
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
                        className="h-4 w-4 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold truncate">
                            {r.display_name}
                          </span>
                          <span className="text-xs font-bold text-primary whitespace-nowrap">
                            {r.points_cost} pts
                          </span>
                        </div>
                        {blocked && (
                          <p className="text-xs text-muted-foreground mt-0.5">{blocked}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
                <p className="text-xs text-muted-foreground pt-1">
                  Saldo após pedido: <strong>{balanceAfter}</strong> pontos
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum brinde disponível agora. Continue acumulando!
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
