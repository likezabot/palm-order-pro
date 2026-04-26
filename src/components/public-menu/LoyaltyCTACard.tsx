/**
 * Card CTA discreto de fidelidade no topo do cardápio público.
 * Substitui o LoyaltyBanner antigo. Aparece somente se loyalty_enabled.
 */
import { useEffect, useState } from "react";
import { Gift, ChevronRight } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchLoyaltyEnabled } from "@/lib/loyalty";

export default function LoyaltyCTACard() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLoyaltyEnabled().then((v) => {
      if (!cancelled) setEnabled(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled || !slug) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 mt-3">
      <button
        type="button"
        onClick={() => nav(`/menu/${slug}/pontos`)}
        className="group w-full text-left rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-4 shadow-[var(--shadow-warm)] transition-all hover:border-primary/50 hover:shadow-[var(--shadow-glow-primary)]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
            <Gift size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black tracking-tight text-foreground">
              Plano B Pontos
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Ganhe 1 ponto a cada R$ 1 e troque por brindes.
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold text-primary">
            Ver meus pontos
            <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </button>
    </div>
  );
}
