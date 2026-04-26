/**
 * FAB de fidelidade. Aparece somente se loyalty_enabled.
 * Posicionado acima do WhatsAppFab para não cobrir o carrinho.
 */
import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchLoyaltyEnabled } from "@/lib/loyalty";

export default function GiftFab() {
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
    <button
      type="button"
      onClick={() => nav(`/menu/${slug}/pontos`)}
      aria-label="Ver meus pontos de fidelidade"
      style={{
        bottom: "calc(9.5rem + env(safe-area-inset-bottom))",
        right: "1rem",
      }}
      className="fixed z-20 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[var(--shadow-warm)] transition-transform active:scale-95 hover:scale-105"
    >
      <Gift size={22} aria-hidden />
    </button>
  );
}
