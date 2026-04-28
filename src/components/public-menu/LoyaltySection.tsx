/**
 * Seção de fidelidade no checkout público.
 * - Aparece apenas se loyalty_enabled e telefone válido.
 * - Faz debounce manual de 400ms na busca de saldo.
 * - Falha silenciosa: se RPC der erro, NÃO bloqueia o checkout.
 */
import { useEffect, useState } from "react";
import { Gift, Loader2, Check, ExternalLink, Info, Sparkles, AlertCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  fetchLoyaltyStatus,
  type LoyaltyStatus,
  blockedReasonText,
} from "@/lib/loyalty";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  phone: string;
  restaurantSlug: string;
  subtotal: number;
  serviceType?: "pickup" | "delivery" | "dine_in";
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
  serviceType = "pickup",
  selectedRewardId,
  onChange,
}: Props) {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<LoyaltyStatus>(EMPTY);
  const [loading, setLoading] = useState(false);

  // Se o método de serviço mudar, verifica se o brinde selecionado ainda é válido
  useEffect(() => {
    if (selectedRewardId && status.rewards.length > 0) {
      const reward = status.rewards.find(r => r.id === selectedRewardId);
      if (reward && !reward.available) {
        onChange(null);
      }
    }
  }, [serviceType, status.rewards, selectedRewardId, onChange]);

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
        serviceType,
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
  }, [phoneDigits, restaurantSlug, subtotal, serviceType]);

  if (!phoneOk) return null;
  if (!status.enabled && !loading) return null;

  const selectedReward = selectedRewardId
    ? status.rewards.find((r) => r.id === selectedRewardId) ?? null
    : null;

  const balanceAfter = Math.max(0, status.balance - (selectedReward?.points_cost ?? 0)) + status.projected_earn;

  return (
    <section className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold flex items-center gap-2">
          <Gift size={20} className="text-primary" />
          Fidelidade & Brindes
        </h2>
        {slug && (
          <Link
            to={`/menu/${slug}/pontos`}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            Regras
            <ExternalLink size={12} />
          </Link>
        )}
      </div>

      <Card className="overflow-hidden border-orange-100 shadow-sm">
        <div className="bg-gradient-to-br from-orange-500 to-primary p-4 text-white">
          {loading ? (
            <div className="flex items-center gap-2 text-sm opacity-90">
              <Loader2 size={16} className="animate-spin" />
              Buscando saldo...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider opacity-80">Saldo Atual</p>
                  <p className="text-2xl font-black">{status.balance} <span className="text-xs font-normal">pontos</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold tracking-wider opacity-80">Ganha hoje</p>
                  <p className="text-lg font-bold">+{status.projected_earn}</p>
                </div>
              </div>
              
              <div className="pt-2 border-t border-white/20 flex justify-between items-center text-[10px] font-bold uppercase tracking-wider opacity-90">
                <span>Saldo previsto após pedido</span>
                <span className="text-sm">{balanceAfter} pts</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 space-y-4 bg-white">
          {selectedReward && (
            <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 animate-in zoom-in-95">
              <div className="bg-primary p-1.5 rounded-full text-white">
                <Check size={14} />
              </div>
              <div className="flex-1 space-y-0.5">
                <p className="text-xs font-bold text-primary uppercase tracking-tight">Brinde selecionado</p>
                <p className="text-sm font-semibold">{selectedReward.display_name}</p>
                <p className="text-[10px] text-muted-foreground">Custo: {selectedReward.points_cost} pontos</p>
              </div>
              <button 
                onClick={() => onChange(null)}
                className="text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
              >
                Remover
              </button>
            </div>
          )}

          {!loading && status.rewards.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">
                Brindes Disponíveis
              </p>
              
              <div className="grid grid-cols-1 gap-2">
                {status.rewards.map((r) => {
                  const isSelected = selectedRewardId === r.id;
                  const disabled = !r.available;
                  const reason = blockedReasonText(r.blocked_reason);

                  return (
                    <button
                      key={r.id}
                      disabled={disabled && !isSelected}
                      onClick={() => onChange(isSelected ? null : r.id)}
                      className={cn(
                        "relative flex items-center gap-3 w-full text-left p-3 rounded-xl border transition-all duration-200",
                        isSelected 
                          ? "border-primary bg-primary/5 ring-1 ring-primary" 
                          : disabled 
                            ? "opacity-60 border-dashed border-muted bg-muted/20 grayscale-[0.5]" 
                            : "border-orange-100 hover:border-primary/40 hover:bg-orange-50/50"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 flex items-center justify-center rounded-lg shrink-0",
                        isSelected ? "bg-primary text-white" : "bg-orange-100 text-primary"
                      )}>
                        <Gift size={20} />
                      </div>
                      
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex justify-between items-baseline gap-2">
                          <h3 className="text-sm font-bold truncate leading-tight">{r.display_name}</h3>
                          <span className={cn(
                            "text-xs font-black shrink-0",
                            isSelected ? "text-primary" : "text-muted-foreground"
                          )}>{r.points_cost} pts</span>
                        </div>
                        
                        {disabled && reason && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-orange-600 bg-orange-100/50 px-2 py-0.5 rounded-full w-fit">
                            <AlertCircle size={10} />
                            {reason}
                          </div>
                        )}
                        
                        {!disabled && !isSelected && (
                          <p className="text-[10px] text-success font-bold uppercase mt-1">Disponível</p>
                        )}
                      </div>

                      <div className={cn(
                        "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                        isSelected ? "bg-primary border-primary text-white" : "border-muted"
                      )}>
                        {isSelected && <Check size={12} strokeWidth={4} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : !loading && (
            <div className="text-center py-6 px-4 bg-orange-50/50 rounded-xl border border-dashed border-orange-200">
              <Gift size={24} className="mx-auto text-orange-200 mb-2" />
              <p className="text-xs font-bold text-orange-800">Continue acumulando pontos!</p>
              <p className="text-[10px] text-orange-600/70 mt-1">Você ganha 1 ponto a cada R$ 1,00 em compras.</p>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
