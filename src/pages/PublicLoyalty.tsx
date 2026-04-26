/**
 * Página pública de fidelidade: /menu/:slug/pontos
 * - Pede WhatsApp do cliente, salva em localStorage.
 * - Consulta saldo + catálogo via get_public_loyalty_status.
 * - Permite escolher um brinde, salvando em sessionStorage e voltando ao cardápio.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Gift, Loader2, Phone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PublicMenuLayout from "@/components/public-menu/PublicMenuLayout";
import LoyaltyRewardCard from "@/components/public-menu/LoyaltyRewardCard";
import {
  fetchLoyaltyEnabled,
  fetchLoyaltyStatus,
  normalizePhoneClient,
  type LoyaltyStatus,
} from "@/lib/loyalty";
import { formatPhone } from "@/lib/public-cart";

const PHONE_KEY = "pb_loyalty_phone";
const REWARD_KEY = "pb_pending_reward";

const EMPTY: LoyaltyStatus = {
  enabled: false,
  balance: 0,
  rewards: [],
  points_per_real: 1,
  projected_earn: 0,
};

export default function PublicLoyalty() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [phone, setPhone] = useState("");
  const [confirmedPhone, setConfirmedPhone] = useState("");
  const [status, setStatus] = useState<LoyaltyStatus>(EMPTY);
  const [loading, setLoading] = useState(false);

  // Carrega telefone salvo + checa enabled
  useEffect(() => {
    fetchLoyaltyEnabled().then(setEnabled);
    try {
      const saved = localStorage.getItem(PHONE_KEY);
      if (saved) {
        setPhone(formatPhone(saved));
        setConfirmedPhone(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const phoneDigits = useMemo(() => normalizePhoneClient(phone), [phone]);
  const phoneOk = phoneDigits.length >= 10;

  // Consulta status sempre que confirmedPhone mudar
  useEffect(() => {
    if (!confirmedPhone || !slug) return;
    let cancelled = false;
    setLoading(true);
    fetchLoyaltyStatus({
      phone: confirmedPhone,
      restaurantSlug: slug,
      orderSubtotal: 0,
    }).then((s) => {
      if (cancelled) return;
      setStatus(s);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [confirmedPhone, slug]);

  const handleConfirmPhone = () => {
    if (!phoneOk) {
      toast.error("Informe um telefone válido (com DDD).");
      return;
    }
    try {
      localStorage.setItem(PHONE_KEY, phoneDigits);
    } catch {
      /* ignore */
    }
    setConfirmedPhone(phoneDigits);
  };

  const handleChooseReward = (rewardId: string) => {
    try {
      sessionStorage.setItem(REWARD_KEY, rewardId);
      sessionStorage.setItem(PHONE_KEY, phoneDigits);
      localStorage.setItem(PHONE_KEY, phoneDigits);
    } catch {
      /* ignore */
    }
    toast.success("Brinde escolhido. Adicione itens e finalize no checkout.");
    nav(`/menu/${slug}`);
  };

  if (enabled === false) {
    return (
      <PublicMenuLayout>
        <div className="mx-auto max-w-md px-4 pt-10 text-center">
          <h1 className="text-xl font-black">Programa indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O programa de pontos não está ativo no momento.
          </p>
          <Button asChild className="mt-6">
            <Link to={`/menu/${slug}`}>Voltar ao cardápio</Link>
          </Button>
        </div>
      </PublicMenuLayout>
    );
  }

  return (
    <PublicMenuLayout>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <button
          onClick={() => nav(`/menu/${slug}`)}
          aria-label="Voltar ao cardápio"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-black tracking-tight">Plano B Pontos</h1>
      </header>

      <main className="mx-auto max-w-xl px-4 py-5 space-y-6">
        {/* Hero do programa */}
        <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-[var(--shadow-warm)]">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Sparkles size={24} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-primary/90">
                Programa de fidelidade
              </div>
              <h2 className="text-xl font-black tracking-tight">Plano B Pontos</h2>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Ganhe <strong className="text-foreground">1 ponto a cada R$ 1</strong> em pedidos
            online de <strong className="text-foreground">retirada</strong>. Pedidos de
            entrega não acumulam pontos. Pontos entram quando o pedido é finalizado.
            Máximo 1 brinde por pedido.
          </p>
        </section>

        {/* Identificação */}
        <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Phone size={16} className="text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Seu WhatsApp
            </h3>
          </div>
          <div className="space-y-2">
            <Label htmlFor="loy-phone" className="text-xs text-muted-foreground">
              Os pontos ficam vinculados ao seu número (somente dígitos).
            </Label>
            <div className="flex gap-2">
              <Input
                id="loy-phone"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                inputMode="tel"
                className="flex-1"
              />
              <Button
                onClick={handleConfirmPhone}
                disabled={!phoneOk}
                className="font-bold"
              >
                Consultar
              </Button>
            </div>
          </div>
        </section>

        {/* Resultado */}
        {confirmedPhone && (
          <section className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                Buscando seu saldo…
              </div>
            ) : (
              <>
                {/* Saldo */}
                <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] text-center">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Você tem
                  </div>
                  <div className="mt-2 text-5xl font-black brand-gradient-text tabular-nums">
                    {status.balance}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">pontos</div>
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    Saldo vinculado ao WhatsApp:{" "}
                    <strong className="font-mono text-foreground">{confirmedPhone}</strong>
                  </div>
                </div>

                {/* Catálogo */}
                <div className="space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    <Gift size={16} className="text-primary" />
                    Brindes disponíveis
                  </h3>
                  {status.rewards.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                      Nenhum brinde cadastrado no momento.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {status.rewards.map((r) => (
                        <LoyaltyRewardCard
                          key={r.id}
                          reward={r}
                          balance={status.balance}
                          onChoose={handleChooseReward}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {!confirmedPhone && (
          <p className="text-center text-xs text-muted-foreground px-4">
            Informe seu WhatsApp para ver seu saldo e os brindes disponíveis.
          </p>
        )}
      </main>
    </PublicMenuLayout>
  );
}
