/**
 * Card de brinde — usado na página /pontos.
 * Mostra nome, custo, pedido mínimo, barra de progresso e CTA "Escolher".
 */
import { Gift, Lock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LoyaltyReward } from "@/lib/loyalty";

type Props = {
  reward: LoyaltyReward;
  balance: number;
  onChoose: (rewardId: string) => void;
};

export default function LoyaltyRewardCard({ reward, balance, onChoose }: Props) {
  const enoughPoints = balance >= reward.points_cost;
  const pct = Math.min(100, Math.round((balance / Math.max(1, reward.points_cost)) * 100));
  const missing = Math.max(0, reward.points_cost - balance);
  const isPickupOnly = reward.blocked_reason === "pickup_only";
  const isDeliveryOnly = reward.blocked_reason === "delivery_only";

  let statusBadge: { label: string; tone: "success" | "warning" | "muted" } = enoughPoints
    ? { label: "Disponível por pontos", tone: "success" }
    : { label: `Faltam ${missing} pontos`, tone: "muted" };

  if (reward.min_order_subtotal > 0) {
    statusBadge = enoughPoints
      ? {
          label: `Pedido mín. R$ ${reward.min_order_subtotal.toFixed(2)}`,
          tone: "warning",
        }
      : { label: `Faltam ${missing} pontos`, tone: "muted" };
  }

  if (isPickupOnly) {
    statusBadge = { label: "Apenas para retirada", tone: "warning" };
  } else if (isDeliveryOnly) {
    statusBadge = { label: "Apenas para entrega", tone: "warning" };
  }

  const canChoose = enoughPoints && !isPickupOnly && !isDeliveryOnly;

  const toneClass =
    statusBadge.tone === "success"
      ? "bg-success/15 text-success border-success/30"
      : statusBadge.tone === "warning"
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-muted text-muted-foreground border-border";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] space-y-3">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            canChoose ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {canChoose ? <Gift size={22} /> : <Lock size={20} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-base text-foreground">{reward.display_name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Custa <strong className="text-primary">{reward.points_cost} pts</strong>
            {reward.min_order_subtotal > 0 && (
              <> · pedido mín. R$ {reward.min_order_subtotal.toFixed(2)}</>
            )}
          </div>
          {isPickupOnly && (
            <div className="text-[11px] text-warning mt-1 font-semibold">
              Resgate disponível apenas para retirada.
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-[hsl(var(--primary-glow))] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground tabular-nums">
            {Math.min(balance, reward.points_cost)} / {reward.points_cost} pts
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${toneClass}`}
          >
            {canChoose && <Check size={11} />}
            {statusBadge.label}
          </span>
        </div>
      </div>

      <Button
        size="sm"
        variant={canChoose ? "default" : "outline"}
        disabled={!canChoose}
        onClick={() => onChoose(reward.id)}
        className="w-full font-bold"
      >
        {isPickupOnly
          ? "Apenas para retirada"
          : isDeliveryOnly
            ? "Apenas para entrega"
            : enoughPoints
              ? "Escolher este brinde"
              : "Continue acumulando"}
      </Button>
    </div>
  );
}
